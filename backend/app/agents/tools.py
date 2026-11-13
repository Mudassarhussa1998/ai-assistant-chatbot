"""Tools the agent can call.

A tool is a plain Python function (sync or async) with type hints and a docstring: Gemini reads
the signature and docstring to decide when and how to call it. Return a JSON-friendly dict.
To give the agent a new ability, write a function here and add it to an agent's `tools` list.
"""

from datetime import datetime, timezone

from app.rag import knowledge_base


async def search_knowledge_base(query: str) -> dict:
    """Search the company knowledge base for information relevant to the user's question.

    Use this whenever the user asks about the product, the assistant itself, setup,
    features, policies or anything that may be documented. Do not use it for small talk.

    Args:
      query: A short, specific search query describing the information needed.
    """
    results = await knowledge_base.search(query)
    if not results:
        return {"results": [], "note": "Nothing relevant found in the knowledge base."}
    return {"results": [{"source": r.source, "text": r.text} for r in results]}


def get_current_datetime() -> dict:
    """Get the current date and time in UTC. Use when the user asks about today's date or time."""
    now = datetime.now(timezone.utc)
    return {"utc": now.isoformat(timespec="seconds"), "weekday": now.strftime("%A")}
