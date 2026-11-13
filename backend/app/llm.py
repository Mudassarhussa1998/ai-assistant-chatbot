"""Shared Gemini client."""

import asyncio
from collections.abc import Awaitable, Callable
from functools import lru_cache
from typing import TypeVar

from google import genai
from google.genai import errors

from app.config import settings

T = TypeVar("T")


class MissingApiKeyError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def get_client() -> genai.Client:
    if not settings.gemini_api_key:
        raise MissingApiKeyError("Server is missing GEMINI_API_KEY.")
    return genai.Client(api_key=settings.gemini_api_key)


async def with_retry(call: Callable[[], Awaitable[T]]) -> T:
    """Run a Gemini call, retrying once on temporary overload / rate limit."""
    try:
        return await call()
    except errors.APIError as err:
        if err.code not in (429, 503):
            raise
        await asyncio.sleep(1.5)
        return await call()
