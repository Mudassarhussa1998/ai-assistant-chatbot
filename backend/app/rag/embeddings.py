"""Turn text into vectors with Gemini embeddings."""

import numpy as np
from google.genai import types

from app.config import settings
from app.llm import get_client, with_retry

DIMENSIONS = 768
BATCH_SIZE = 100


async def _embed(texts: list[str], task_type: str) -> np.ndarray:
    client = get_client()
    config = types.EmbedContentConfig(task_type=task_type, output_dimensionality=DIMENSIONS)
    vectors: list[list[float]] = []
    for start in range(0, len(texts), BATCH_SIZE):
        # Each text must be its own Content: a plain list of strings is embedded as ONE input.
        contents = [types.Content(parts=[types.Part(text=t)]) for t in texts[start : start + BATCH_SIZE]]
        response = await with_retry(
            lambda: client.aio.models.embed_content(
                model=settings.embedding_model, contents=contents, config=config
            )
        )
        vectors.extend(e.values for e in response.embeddings)
    matrix = np.array(vectors, dtype=np.float32)
    # Normalise so a dot product equals cosine similarity.
    return matrix / np.linalg.norm(matrix, axis=1, keepdims=True)


async def embed_documents(texts: list[str]) -> np.ndarray:
    return await _embed(texts, "RETRIEVAL_DOCUMENT")


async def embed_query(text: str) -> np.ndarray:
    return (await _embed([text], "RETRIEVAL_QUERY"))[0]
