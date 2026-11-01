"""Provider-independent tool contracts and a bounded arithmetic tool."""

import ast
import math
import operator
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ToolCall:
    call_id: str
    name: str
    arguments: dict[str, object]


class Tool(Protocol):
    name: str
    description: str
    parameters: dict[str, object]

    def execute(self, arguments: dict[str, object]) -> str: ...


class ToolRegistry:
    def __init__(self, tools: Iterable[Tool] = ()) -> None:
        self._tools: dict[str, Tool] = {}
        for tool in tools:
            if tool.name in self._tools:
                raise ValueError(f"Duplicate tool name: {tool.name}")
            self._tools[tool.name] = tool

    def definitions(self) -> list[dict[str, object]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                },
            }
            for tool in self._tools.values()
        ]

    def contains(self, name: str) -> bool:
        return name in self._tools

    def execute(self, name: str, arguments: dict[str, object]) -> str:
        tool = self._tools.get(name)
        if tool is None:
            raise ValueError(f"Tool is not enabled: {name}")
        return tool.execute(arguments)


class CalculatorTool:
    name = "calculator"
    description = "Evaluate a basic arithmetic expression."
    parameters = {
        "type": "object",
        "properties": {"expression": {"type": "string"}},
        "required": ["expression"],
        "additionalProperties": False,
    }

    def execute(self, arguments: dict[str, object]) -> str:
        expression = arguments.get("expression")
        if not isinstance(expression, str) or not expression.strip():
            raise ValueError("expression must be a non-empty string")
        if len(expression) > 256:
            raise ValueError("expression is too long")

        try:
            tree = ast.parse(expression, mode="eval")
        except SyntaxError as error:
            raise ValueError("expression is not valid arithmetic") from error
        if sum(1 for _ in ast.walk(tree)) > 64:
            raise ValueError("expression is too complex")

        result = self._evaluate(tree.body)
        return str(result)

    def _evaluate(self, node: ast.AST) -> int | float:
        binary_operators = {
            ast.Add: operator.add,
            ast.Sub: operator.sub,
            ast.Mult: operator.mul,
            ast.Div: operator.truediv,
            ast.FloorDiv: operator.floordiv,
            ast.Mod: operator.mod,
            ast.Pow: operator.pow,
        }
        unary_operators = {ast.UAdd: operator.pos, ast.USub: operator.neg}

        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            return self._checked(node.value)
        if isinstance(node, ast.BinOp) and type(node.op) in binary_operators:
            left = self._evaluate(node.left)
            right = self._evaluate(node.right)
            if isinstance(node.op, ast.Pow) and abs(right) > 64:
                raise ValueError("exponent magnitude must be at most 64")
            return self._checked(binary_operators[type(node.op)](left, right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in unary_operators:
            return self._checked(unary_operators[type(node.op)](self._evaluate(node.operand)))
        raise ValueError("only numeric literals and basic arithmetic operators are allowed")

    @staticmethod
    def _checked(value: int | float) -> int | float:
        if isinstance(value, int) and value.bit_length() > 256:
            raise ValueError("result is too large")
        if isinstance(value, float) and (not math.isfinite(value) or abs(value) > 1e100):
            raise ValueError("result is too large or not finite")
        return value