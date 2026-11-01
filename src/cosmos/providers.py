"""In-process local model runtime for the standalone COSMOS application."""

from __future__ import annotations

import importlib.util
import json
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Protocol, Sequence

from cosmos.agent import ChatResponse
from cosmos.provider import ProviderError
from cosmos.tools import ToolCall


@dataclass(frozen=True)
class ModelDescriptor:
    id: str
    name: str

    def as_dict(self) -> dict[str, str]:
        return {"id": self.id, "name": self.name}


class LocalLlamaClient:
    def __init__(self, model_path: str, context_size: int) -> None:
        self.model_path = model_path
        self.context_size = context_size

    def complete(
        self,
        messages: Sequence[dict[str, object]],
        model: str,
        tools: Sequence[dict[str, object]] = (),
    ) -> ChatResponse:
        try:
            runtime = _load_model(self.model_path, self.context_size)
            request: dict[str, object] = {
                "messages": list(messages),
                "temperature": 0.2,
                "max_tokens": min(128, self.context_size),
            }
            if tools:
                request["tools"] = list(tools)
            result = runtime.create_chat_completion(**request)
            content = result["choices"][0]["message"]["content"]
            if isinstance(content, str):
                content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
            raw_calls = result["choices"][0]["message"].get("tool_calls", [])
            calls = tuple(
                ToolCall(
                    call_id=call["id"],
                    name=call["function"]["name"],
                    arguments=json.loads(call["function"]["arguments"]),
                )
                for call in raw_calls
            )
        except ProviderError:
            raise
        except Exception as error:
            raise ProviderError("The local model could not complete this request.") from error
        if (content is None or not isinstance(content, str) or not content.strip()) and not calls:
            raise ProviderError("The local model returned no text response.")
        return ChatResponse(content, calls)


class ModelProvider(Protocol):
    provider_id: str
    display_name: str
    default_model: str | None

    def is_configured(self) -> bool: ...
    def create_client(self) -> LocalLlamaClient: ...
    def discover_models(self) -> list[ModelDescriptor]: ...
    def health_check(self) -> dict[str, object]: ...


class LocalModelProvider:
    provider_id = "local"
    display_name = "COSMOS local model"

    def __init__(self, model_path: str | None, context_size: int = 4096) -> None:
        self.model_path = model_path.strip() if model_path else ""
        self.context_size = context_size

    @property
    def default_model(self) -> str | None:
        return Path(self.model_path).name if self.model_path else None

    def is_configured(self) -> bool:
        return bool(
            self.model_path
            and Path(self.model_path).is_file()
            and importlib.util.find_spec("llama_cpp") is not None
        )

    def create_client(self) -> LocalLlamaClient:
        if not self.is_configured():
            raise ProviderError(
                "Install COSMOS with the local extra and set COSMOS_MODEL_PATH to a GGUF model file."
            )
        return LocalLlamaClient(self.model_path, self.context_size)

    def discover_models(self) -> list[ModelDescriptor]:
        if not self.is_configured() or self.default_model is None:
            raise ProviderError(
                "Install COSMOS with the local extra and set COSMOS_MODEL_PATH to a GGUF model file."
            )
        return [ModelDescriptor(self.default_model, "COSMOS local model")]

    def health_check(self) -> dict[str, object]:
        configured = self.is_configured()
        return {
            "provider": self.provider_id,
            "configured": configured,
            "healthy": configured,
            "model": self.default_model or "",
        }


class ModelProviderRegistry:
    def __init__(self, provider: ModelProvider) -> None:
        self._provider = provider
        self.default_provider = provider.provider_id

    def get(self, provider_id: str | None = None) -> ModelProvider:
        if provider_id not in {None, self.default_provider}:
            raise ValueError("Unsupported model provider.")
        return self._provider

    def list(self) -> list[dict[str, object]]:
        return [
            {
                "id": self._provider.provider_id,
                "name": self._provider.display_name,
                "configured": self._provider.is_configured(),
                "default_model": self._provider.default_model,
            }
        ]


def create_provider_registry(environment: dict[str, str] | None = None) -> ModelProviderRegistry:
    values = environment if environment is not None else os.environ
    try:
        context_size = int(values.get("COSMOS_CONTEXT_SIZE", "4096"))
    except ValueError as error:
        raise ValueError("COSMOS_CONTEXT_SIZE must be an integer.") from error
    if not 512 <= context_size <= 131072:
        raise ValueError("COSMOS_CONTEXT_SIZE must be between 512 and 131072.")
    return ModelProviderRegistry(
        LocalModelProvider(values.get("COSMOS_MODEL_PATH"), context_size=context_size)
    )


@lru_cache(maxsize=1)
def _load_model(model_path: str, context_size: int):
    try:
        from llama_cpp import Llama
    except ImportError as error:
        raise ProviderError(
            "Install COSMOS with the local extra to enable in-process inference."
        ) from error
    try:
        thread_count = max(1, os.cpu_count() or 1)
        return Llama(
            model_path=model_path,
            n_ctx=context_size,
            n_threads=thread_count,
            n_threads_batch=thread_count,
            verbose=False,
        )
    except Exception as error:
        raise ProviderError("The local model file could not be loaded.") from error
