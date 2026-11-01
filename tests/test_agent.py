import unittest

from cosmos.agent import ChatResponse, CosmosAgent, SYSTEM_PROMPT
from cosmos.tools import CalculatorTool, ToolCall, ToolRegistry


class FakeClient:
    def __init__(self) -> None:
        self.calls = []
        self.responses = [ChatResponse("Hello.")]

    def complete(self, messages, model, tools=()):
        self.calls.append((list(messages), model, list(tools)))
        return self.responses.pop(0)


class CosmosAgentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = FakeClient()
        self.agent = CosmosAgent(self.client, "test-model")

    def test_sends_conversation_and_retains_reply(self) -> None:
        self.assertEqual(self.agent.respond("  Hi  "), "Hello.")
        messages, model, tools = self.client.calls[0]
        self.assertEqual(model, "test-model")
        self.assertEqual(tools, [])
        self.assertEqual(messages[0]["content"], SYSTEM_PROMPT)
        self.assertEqual(messages[1], {"role": "user", "content": "Hi"})
        self.assertEqual(self.agent.messages[-1], {"role": "assistant", "content": "Hello."})

    def test_reset_discards_previous_turns(self) -> None:
        self.agent.respond("Hi")
        self.agent.reset()
        self.assertEqual(len(self.agent.messages), 1)
        self.assertEqual(self.agent.messages[0]["role"], "system")

    def test_empty_message_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            self.agent.respond("  ")
        self.assertEqual(self.client.calls, [])

    def test_failed_request_does_not_leave_user_message_in_history(self) -> None:
        class FailingClient:
            def complete(self, messages, model, tools=()):
                raise RuntimeError("failed")

        agent = CosmosAgent(FailingClient(), "test-model")
        with self.assertRaises(RuntimeError):
            agent.respond("Hi")
        self.assertEqual(len(agent.messages), 1)

    def test_approved_tool_call_runs_and_returns_tool_result_to_model(self) -> None:
        self.client.responses = [
            ChatResponse(None, [ToolCall("call-1", "calculator", {"expression": "2 + 2"})]),
            ChatResponse("The result is 4."),
        ]
        approvals = []
        agent = CosmosAgent(
            self.client,
            "test-model",
            ToolRegistry([CalculatorTool()]),
            lambda call: approvals.append(call) or True,
        )

        self.assertEqual(agent.respond("What is 2 + 2?"), "The result is 4.")
        self.assertEqual(len(approvals), 1)
        self.assertEqual(approvals[0].name, "calculator")
        self.assertEqual(agent.messages[-2]["role"], "tool")
        self.assertEqual(agent.messages[-2]["content"], "4")

    def test_denied_tool_call_is_not_executed(self) -> None:
        self.client.responses = [
            ChatResponse(None, [ToolCall("call-1", "calculator", {"expression": "2 + 2"})]),
            ChatResponse("I did not run the calculation."),
        ]
        agent = CosmosAgent(
            self.client,
            "test-model",
            ToolRegistry([CalculatorTool()]),
            lambda call: False,
        )

        agent.respond("Calculate this")

        self.assertEqual(agent.messages[-2]["content"], "User denied this tool call.")

    def test_unregistered_tool_is_never_approved_or_executed(self) -> None:
        self.client.responses = [
            ChatResponse(None, [ToolCall("call-1", "shell", {"command": "id"})]),
            ChatResponse("That tool is unavailable."),
        ]
        approvals = []
        agent = CosmosAgent(
            self.client,
            "test-model",
            ToolRegistry([CalculatorTool()]),
            lambda call: approvals.append(call) or True,
        )

        agent.respond("Run a command")

        self.assertEqual(approvals, [])
        self.assertEqual(agent.messages[-2]["content"], "Tool is not enabled.")


if __name__ == "__main__":
    unittest.main()