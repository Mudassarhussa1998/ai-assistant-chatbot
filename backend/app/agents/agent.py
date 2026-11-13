"""A tool-calling agent on top of Gemini.

The loop: send the conversation to Gemini → if it asks to call tools, run them and send back
the results → repeat until Gemini answers in plain text (or MAX_STEPS is reached).
"""

import inspect
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from google.genai import types

from app.config import settings
from app.llm import get_client, with_retry

logger = logging.getLogger(__name__)

MAX_STEPS = 6


@dataclass
class AgentResult:
    reply: str
    sources: list[str] = field(default_factory=list)
    tool_calls: list[str] = field(default_factory=list)


@dataclass
class Agent:
    name: str
    instructions: str
    tools: list[Callable[..., Any]] = field(default_factory=list)
    model: str = settings.chat_model

    def _config(self) -> types.GenerateContentConfig:
        return types.GenerateContentConfig(
            system_instruction=self.instructions,
            tools=self.tools or None,
            # We run tools ourselves (below) so async tools work and we can collect sources.
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            thinking_config=None
            if self.model.startswith("gemini-2")
            else types.ThinkingConfig(thinking_level=settings.thinking_level),
        )

    async def _run_tool(self, call: types.FunctionCall, result: AgentResult) -> dict:
        tool = next((t for t in self.tools if t.__name__ == call.name), None)
        result.tool_calls.append(call.name)
        if tool is None:
            return {"error": f"Unknown tool {call.name}"}
        try:
            output = tool(**(call.args or {}))
            if inspect.isawaitable(output):
                output = await output
        except Exception as err:  # Report tool failures to the model instead of crashing the chat.
            logger.exception("Tool %s failed", call.name)
            return {"error": str(err)}
        for item in output.get("results", []) if isinstance(output, dict) else []:
            if item.get("source") and item["source"] not in result.sources:
                result.sources.append(item["source"])
        return output

    async def run(self, contents: list[types.Content]) -> AgentResult:
        client = get_client()
        config = self._config()
        result = AgentResult(reply="")
        contents = list(contents)

        for _ in range(MAX_STEPS):
            response = await with_retry(
                lambda: client.aio.models.generate_content(model=self.model, contents=contents, config=config)
            )
            calls = response.function_calls or []
            if not calls:
                result.reply = response.text or "Sorry, I couldn't come up with a reply."
                return result

            # Keep the model's own turn (it carries Gemini's thought signatures), then the tool results.
            contents.append(response.candidates[0].content)
            parts = []
            for call in calls:
                output = await self._run_tool(call, result)
                logger.info("Tool %s(%s)", call.name, json.dumps(call.args or {})[:200])
                parts.append(
                    types.Part(function_response=types.FunctionResponse(id=call.id, name=call.name, response=output))
                )
            contents.append(types.Content(role="user", parts=parts))

        result.reply = "Sorry, that took too many steps. Could you rephrase your question?"
        return result
