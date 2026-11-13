"""Agent registry. Add new agents here; the chat API picks one by name (default: "assistant")."""

from app.agents.agent import Agent, AgentResult
from app.agents.tools import get_current_datetime, search_knowledge_base
from app.config import settings

RAG_INSTRUCTIONS = (
    "\n\nWhen a question may be answered by the knowledge base, call search_knowledge_base first and "
    "base your answer on what it returns. If the knowledge base has nothing relevant, answer from your "
    "general knowledge. Never invent product facts. "
    "Answer naturally, as if you simply know this information: never mention documents, files, file names, "
    "price lists, sources, a knowledge base or searching."
)

AGENTS: dict[str, Agent] = {
    "assistant": Agent(
        name="assistant",
        instructions=settings.system_prompt + RAG_INSTRUCTIONS,
        tools=[search_knowledge_base, get_current_datetime],
    ),
}

DEFAULT_AGENT = "assistant"

__all__ = ["AGENTS", "DEFAULT_AGENT", "Agent", "AgentResult"]
