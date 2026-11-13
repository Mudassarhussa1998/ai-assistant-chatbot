"""Split documents into overlapping chunks small enough to embed and retrieve precisely."""

import re


def split_text(text: str, chunk_size: int = 1000, overlap: int = 150) -> list[str]:
    """Pack paragraphs into chunks of ~chunk_size characters, carrying a little overlap forward."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        # Very long paragraphs get hard-split so no chunk blows past the limit.
        pieces = [para[i : i + chunk_size] for i in range(0, len(para), chunk_size)] or [para]
        for piece in pieces:
            if current and len(current) + len(piece) + 2 > chunk_size:
                chunks.append(current)
                current = current[-overlap:] + "\n\n" + piece if overlap else piece
            else:
                current = f"{current}\n\n{piece}" if current else piece
    if current:
        chunks.append(current)
    return chunks
