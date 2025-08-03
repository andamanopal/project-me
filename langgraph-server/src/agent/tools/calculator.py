"""Simple calculator tool for the LangGraph agent."""

from langchain_core.tools import tool
from typing import Dict


@tool
def add_numbers(a: float, b: float) -> Dict:
    """
    Add two numbers together.

    Args:
        a: The first number to add
        b: The second number to add

    Returns:
        Dict with the sum result and calculation details
    """
    result = a + b
    return {
        "success": True,
        "a": a,
        "b": b,
        "result": result,
        "operation": "addition",
        "expression": f"{a} + {b} = {result}"
    }
