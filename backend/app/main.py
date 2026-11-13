"""FastAPI backend: the chat API used by the widget.

Run locally:  .venv/bin/uvicorn app.main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.genai import errors, types
from pydantic import BaseModel, Field

from app.admin import router as admin_router
from app.agents import AGENTS, DEFAULT_AGENT
from app.config import settings
from app.llm import MissingApiKeyError
from app.rag import knowledge_base

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not settings.admin_token:
        logger.warning("ADMIN_TOKEN is not set, so the admin panel is disabled.")
    if not settings.gemini_api_key:
        logger.warning("GEMINI_API_KEY is not set. Add it to backend/.env")
    else:
        try:
            await knowledge_base.build()
        except Exception:
            # The chat still works without RAG; log and carry on.
            logger.exception("Could not build the knowledge base")
    yield


app = FastAPI(title="AI Assistant API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)
app.include_router(admin_router)


class Message(BaseModel):
    role: Literal["user", "bot"]
    text: str = Field(min_length=1)


class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1)
    agent: str = DEFAULT_AGENT


class ChatResponse(BaseModel):
    reply: str
    sources: list[str] = []


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "knowledge_chunks": len(knowledge_base.store)}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    agent = AGENTS.get(request.agent)
    if agent is None:
        raise HTTPException(400, f"Unknown agent '{request.agent}'.")

    # Convert widget messages ({role: "user"|"bot", text}) to Gemini's format.
    contents = [
        types.Content(role="user" if m.role == "user" else "model", parts=[types.Part(text=m.text[:4000])])
        for m in request.messages[-settings.max_history :]
    ]
    try:
        result = await agent.run(contents)
    except MissingApiKeyError as err:
        raise HTTPException(500, str(err))
    except errors.APIError as err:
        logger.error("Gemini error: %s", err)
        raise HTTPException(502, "The AI service returned an error. Please try again.")
    return ChatResponse(reply=result.reply, sources=result.sources)
