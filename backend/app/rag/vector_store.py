"""A small in-memory vector store.

Fine for hundreds of documents. For bigger collections, swap this class for a hosted
vector database (pgvector, Qdrant, Pinecone, Chroma…) that offers the same add/search methods.
"""

from dataclasses import dataclass

import numpy as np


@dataclass
class Chunk:
    text: str
    source: str


class InMemoryVectorStore:
    def __init__(self) -> None:
        self.chunks: list[Chunk] = []
        self.vectors = np.zeros((0, 0), dtype=np.float32)

    def __len__(self) -> int:
        return len(self.chunks)

    def add(self, chunks: list[Chunk], vectors: np.ndarray) -> None:
        self.chunks.extend(chunks)
        self.vectors = vectors if self.vectors.size == 0 else np.vstack([self.vectors, vectors])

    def search(self, query_vector: np.ndarray, top_k: int) -> list[tuple[Chunk, float]]:
        if not self.chunks:
            return []
        scores = self.vectors @ query_vector
        best = np.argsort(scores)[::-1][:top_k]
        return [(self.chunks[i], float(scores[i])) for i in best]
