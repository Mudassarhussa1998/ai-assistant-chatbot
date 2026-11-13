"""Admin API for managing knowledge-base documents. Every route requires the ADMIN_TOKEN."""

import re
import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.config import settings
from app.rag import knowledge_base
from app.rag.loaders import SUPPORTED_EXTENSIONS

MAX_FILE_BYTES = 10 * 1024 * 1024


def require_admin(authorization: str | None = Header(default=None)) -> None:
    if not settings.admin_token:
        raise HTTPException(503, "The admin panel is disabled. Set ADMIN_TOKEN on the backend to enable it.")
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not secrets.compare_digest(token.encode(), settings.admin_token.encode()):
        raise HTTPException(401, "Wrong admin password.")


router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])


class DocumentOut(BaseModel):
    name: str
    size: int
    chunks: int
    updated_at: str


class DocumentsOut(BaseModel):
    documents: list[DocumentOut]
    total_chunks: int


class TextDocumentIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=500_000)


def _safe_path(name: str) -> Path:
    """Map a user-supplied file name to a path inside the knowledge folder (no ../ tricks)."""
    stem, suffix = Path(name).stem, Path(name).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        allowed = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise HTTPException(400, f"'{name}' isn't supported. Upload one of: {allowed}.")
    stem = re.sub(r"[^A-Za-z0-9._ -]+", "-", stem).strip(" .-") or "document"
    return settings.knowledge_dir / f"{stem[:100]}{suffix}"


def _listing() -> DocumentsOut:
    docs = [DocumentOut(**vars(d)) for d in knowledge_base.documents()]
    return DocumentsOut(documents=docs, total_chunks=len(knowledge_base.store))


async def _reindex() -> DocumentsOut:
    try:
        await knowledge_base.build()
    except Exception as err:
        raise HTTPException(502, f"Saved, but indexing failed: {err}")
    return _listing()


@router.get("/verify")
async def verify() -> dict:
    return {"ok": True}


@router.get("/documents", response_model=DocumentsOut)
async def list_documents() -> DocumentsOut:
    return _listing()


@router.post("/documents", response_model=DocumentsOut)
async def upload_documents(files: list[UploadFile]) -> DocumentsOut:
    targets = []
    for upload in files:
        data = await upload.read()
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(413, f"'{upload.filename}' is larger than 10 MB.")
        targets.append((_safe_path(upload.filename or "document.txt"), data))
    settings.knowledge_dir.mkdir(parents=True, exist_ok=True)
    for path, data in targets:
        path.write_bytes(data)
    return await _reindex()


@router.post("/documents/text", response_model=DocumentsOut)
async def write_document(doc: TextDocumentIn) -> DocumentsOut:
    path = _safe_path(f"{doc.title}.md")
    settings.knowledge_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(f"# {doc.title.strip()}\n\n{doc.content.strip()}\n", encoding="utf-8")
    return await _reindex()


@router.delete("/documents/{name:path}", response_model=DocumentsOut)
async def delete_document(name: str) -> DocumentsOut:
    path = (settings.knowledge_dir / name).resolve()
    folder = settings.knowledge_dir.resolve()
    if folder not in path.parents or not path.is_file() or path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise HTTPException(404, f"No document named '{name}'.")
    path.unlink()
    return await _reindex()
