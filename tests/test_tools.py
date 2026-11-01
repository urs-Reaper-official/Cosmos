import unittest

from cosmos.tools import CalculatorTool, ToolRegistry


class CalculatorToolTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tool = CalculatorTool()

    def test_evaluates_basic_arithmetic(self) -> None:
        self.assertEqual(self.tool.execute({"expression": "(2 + 3) * 4 / 2"}), "10.0")
        self.assertEqual(self.tool.execute({"expression": "2 ** 8"}), "256")

    def test_rejects_non_arithmetic_syntax(self) -> None:
        for expression in ("__import__('os')", "1 < 2", "[1, 2]", "True"):
            with self.subTest(expression=expression), self.assertRaises(ValueError):
                self.tool.execute({"expression": expression})

    def test_rejects_invalid_or_unbounded_input(self) -> None:
        for arguments in ({}, {"expression": " "}, {"expression": "2 ** 65"}):
            with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                self.tool.execute(arguments)
        with self.assertRaises(ValueError):
            self.tool.execute({"expression": "1 + " * 100})

    def test_registry_only_exposes_registered_tools(self) -> None:
        registry = ToolRegistry([self.tool])
        self.assertTrue(registry.contains("calculator"))
        self.assertFalse(registry.contains("shell"))
        self.assertEqual(registry.definitions()[0]["function"]["name"], "calculator")
        with self.assertRaises(ValueError):
            registry.execute("shell", {})


if __name__ == "__main__":
    unittest.main()