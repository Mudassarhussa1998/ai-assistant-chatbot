"""Extract plain text from the document types the knowledge base accepts."""

from pathlib import Path

from docx import Document as DocxDocument
from pypdf import PdfReader

SUPPORTED_EXTENSIONS = {".md", ".txt", ".pdf", ".docx"}


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        reader = PdfReader(path)
        return "\n\n".join((page.extract_text() or "").strip() for page in reader.pages)
    if suffix == ".docx":
        doc = DocxDocument(str(path))
        blocks = [p.text for p in doc.paragraphs]
        # Tables often hold prices, sizes and policies, so keep them as "cell | cell" rows.
        for table in doc.tables:
            blocks.extend(" | ".join(cell.text.strip() for cell in row.cells) for row in table.rows)
        return "\n\n".join(b for b in blocks if b.strip())
    return path.read_text(encoding="utf-8", errors="ignore")
