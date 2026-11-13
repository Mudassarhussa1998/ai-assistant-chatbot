"""Loads documents from the knowledge folder, embeds them, and answers similarity searches.

Documents are added through the admin panel (or by dropping .md/.txt/.pdf/.docx files into
backend/knowledge/ and restarting). Embeddings are cached per chunk on disk, so re-indexing only
embeds new or changed text instead of re-embedding (and re-billing) everything.
"""

import asyncio
import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from app.config import settings
from app.rag.chunking import split_text
from app.rag.embeddings import embed_documents, embed_query
from app.rag.loaders import SUPPORTED_EXTENSIONS, extract_text
from app.rag.vector_store import Chunk, InMemoryVectorStore

logger = logging.getLogger(__name__)

# Results below this similarity are too unrelated to be worth showing the model.
MIN_SCORE = 0.5
# Gemini embeddings give even unrelated text fairly high scores, so also drop anything that scores
# well below the best match. This keeps answers (and the sources shown) to the relevant documents.
RELATIVE_MARGIN = 0.08


@dataclass
class SearchResult:
    text: str
    source: str
    score: float


@dataclass
class DocumentInfo:
    name: str
    size: int
    chunks: int
    updated_at: str


def _chunk_hash(chunk: Chunk) -> str:
    return hashlib.sha256(f"{settings.embedding_model}\n{chunk.source}\n{chunk.text}".encode()).hexdigest()


class KnowledgeBase:
    def __init__(self, folder: Path) -> None:
        self.folder = folder
        self.cache_file = folder / ".index" / "embeddings.npz"
        self.store = InMemoryVectorStore()
        self._lock = asyncio.Lock()

    @property
    def is_empty(self) -> bool:
        return len(self.store) == 0

    def document_paths(self) -> list[Path]:
        if not self.folder.is_dir():
            return []
        return [
            p
            for p in sorted(self.folder.rglob("*"))
            if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS and ".index" not in p.parts
        ]

    def _load_chunks(self) -> list[Chunk]:
        chunks: list[Chunk] = []
        for path in self.document_paths():
            source = str(path.relative_to(self.folder))
            try:
                text = extract_text(path)
            except Exception:
                logger.exception("Could not read %s; skipping it.", source)
                continue
            chunks.extend(Chunk(text=piece, source=source) for piece in split_text(text))
        return chunks

    def _read_cache(self) -> dict[str, np.ndarray]:
        try:
            with np.load(self.cache_file) as data:
                return {key: data[key] for key in data.files}
        except (OSError, ValueError):
            return {}

    def _write_cache(self, cache: dict[str, np.ndarray]) -> None:
        try:
            self.cache_file.parent.mkdir(parents=True, exist_ok=True)
            np.savez(self.cache_file, **cache)
        except OSError:
            logger.warning("Could not write embedding cache; continuing without it.")

    async def build(self) -> None:
        """(Re)index every document in the knowledge folder."""
        async with self._lock:
            chunks = self._load_chunks()
            store = InMemoryVectorStore()
            if chunks:
                hashes = [_chunk_hash(c) for c in chunks]
                cache = self._read_cache()
                missing = [i for i, h in enumerate(hashes) if h not in cache]
                if missing:
                    new_vectors = await embed_documents([chunks[i].text for i in missing])
                    for i, vector in zip(missing, new_vectors):
                        cache[hashes[i]] = vector
                # Keep only vectors for chunks that still exist.
                cache = {h: cache[h] for h in hashes}
                self._write_cache(cache)
                store.add(chunks, np.stack([cache[h] for h in hashes]))
                logger.info(
                    "Knowledge base ready: %d chunks (%d newly embedded) from %s.",
                    len(chunks), len(missing), self.folder,
                )
            else:
                logger.info("Knowledge base is empty (no documents in %s).", self.folder)
            self.store = store

    async def search(self, query: str, top_k: int | None = None) -> list[SearchResult]:
        if self.is_empty:
            return []
        hits = self.store.search(await embed_query(query), top_k or settings.rag_top_k)
        if not hits:
            return []
        cutoff = max(MIN_SCORE, hits[0][1] - RELATIVE_MARGIN)
        return [SearchResult(c.text, c.source, score) for c, score in hits if score >= cutoff]

    def documents(self) -> list[DocumentInfo]:
        counts: dict[str, int] = {}
        for chunk in self.store.chunks:
            counts[chunk.source] = counts.get(chunk.source, 0) + 1
        infos = []
        for path in self.document_paths():
            name = str(path.relative_to(self.folder))
            stat = path.stat()
            infos.append(
                DocumentInfo(
                    name=name,
                    size=stat.st_size,
                    chunks=counts.get(name, 0),
                    updated_at=datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(timespec="seconds"),
                )
            )
        return infos


knowledge_base = KnowledgeBase(settings.knowledge_dir)
