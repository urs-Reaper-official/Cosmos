"""Command-line interface for COSMOS."""

import argparse
import json
import os
import sys

from cosmos.agent import CosmosAgent
from cosmos.providers import create_provider_registry
from cosmos.tools import CalculatorTool, ToolCall, ToolRegistry


def confirm_tool_call(call: ToolCall) -> bool:
    print(f"COSMOS requests tool: {call.name}")
    print(f"Arguments: {json.dumps(call.arguments, sort_keys=True)}")
    try:
        answer = input("Allow this call once? [y/N]: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return False
    return answer == "y"


def main() -> None:
    parser = argparse.ArgumentParser(description="Chat with COSMOS.")
    parser.add_argument(
        "--enable-calculator",
        action="store_true",
        help="Expose the arithmetic calculator; each call still requires approval",
    )
    args = parser.parse_args()

    provider = create_provider_registry().get()
    if not provider.is_configured():
        parser.error(
            "Set COSMOS_MODEL_PATH to a local GGUF model and install the [local] extra."
        )
    client = provider.create_client()
    tools = ToolRegistry([CalculatorTool()]) if args.enable_calculator else ToolRegistry()
    approval = confirm_tool_call if args.enable_calculator else None
    agent = CosmosAgent(client, provider.default_model or "local", tools, approval)

    print("COSMOS ready. Enter /clear to reset the conversation or /exit to quit.")
    while True:
        try:
            message = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return

        if message == "/exit":
            return
        if message == "/clear":
            agent.reset()
            print("Conversation cleared.")
            continue
        if not message:
            continue

        try:
            print(f"COSMOS: {agent.respond(message)}")
        except RuntimeError as error:
            print(f"COSMOS: {error}", file=sys.stderr)


if __name__ == "__main__":
    main()