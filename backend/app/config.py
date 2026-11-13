"""App settings, read from environment variables (and backend/.env when running locally)."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

DEFAULT_SYSTEM_PROMPT = (
    "You are an AI assistant. Your main purpose is to be integrated into any system and help its users. "
    "Be friendly, clear and concise, and use short paragraphs or bullet lists when helpful."
)


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str | None
    chat_model: str
    embedding_model: str
    # low | medium | high — "low" keeps chat replies fast.
    thinking_level: str
    system_prompt: str
    # Sites allowed to call the API from the browser, or ["*"] for any.
    allowed_origins: list[str]
    knowledge_dir: Path
    rag_top_k: int
    max_history: int
    # Password for the admin panel. Admin endpoints are disabled while it's unset.
    admin_token: str | None


def _get_settings() -> Settings:
    env = os.environ
    return Settings(
        gemini_api_key=env.get("GEMINI_API_KEY"),
        chat_model=env.get("GEMINI_MODEL", "gemini-3.8-flash"),
        embedding_model=env.get("GEMINI_EMBEDDING_MODEL", "gemini-embedding-2"),
        thinking_level=env.get("GEMINI_THINKING_LEVEL", "low"),
        system_prompt=env.get("SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT),
        allowed_origins=[o.strip() for o in env.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()],
        knowledge_dir=Path(env.get("KNOWLEDGE_DIR", BACKEND_DIR / "knowledge")),
        rag_top_k=int(env.get("RAG_TOP_K", "4")),
        max_history=int(env.get("MAX_HISTORY", "20")),
        admin_token=env.get("ADMIN_TOKEN") or None,
    )


settings = _get_settings()
