"""Interactive test script to chat with the LangGraph agent."""

import asyncio
import json
import sys
from pathlib import Path

# Add the parent directory to the path so we can import the agent
sys.path.insert(0, str(Path(__file__).parent.parent))

from langchain_core.messages import HumanMessage, AIMessage
from src.agent.graph import graph

# ANSI color codes for better readability
class Colors:
    HEADER = "\033[95m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RESET = "\033[0m"


def format_tool_input(input_data: dict) -> str:
    """Format tool input nicely."""
    if not input_data:
        return "(no input)"
    return json.dumps(input_data, indent=2, ensure_ascii=False)


def format_tool_output(output) -> str:
    """Format tool output, truncating if too long."""
    output_str = str(output)
    
    # Try to parse as JSON for nicer formatting
    try:
        if hasattr(output, 'content'):
            parsed = json.loads(output.content)
            output_str = json.dumps(parsed, indent=2, ensure_ascii=False)
    except (json.JSONDecodeError, AttributeError):
        pass
    
    # Truncate long outputs
    max_len = 1000
    if len(output_str) > max_len:
        return output_str[:max_len] + f"\n{Colors.DIM}... (truncated){Colors.RESET}"
    return output_str


def print_header():
    """Print the welcome header."""
    print(f"\n{Colors.BOLD}{'═' * 60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}🤖 Project-Me - LangGraph Agent Chat{Colors.RESET}")
    print(f"{Colors.BOLD}{'═' * 60}{Colors.RESET}")
    print(f"{Colors.DIM}Type your message and press Enter. Type 'exit' or 'quit' to leave.{Colors.RESET}")
    print(f"{Colors.DIM}Type 'clear' to reset conversation history.{Colors.RESET}")
    print(f"{Colors.BOLD}{'═' * 60}{Colors.RESET}\n")


async def stream_response(messages: list) -> str:
    """Stream the agent response and return the full response text."""
    full_response = []
    
    print(f"\n{Colors.CYAN}🤖 Project-Me:{Colors.RESET} ", end="", flush=True)
    
    async for event in graph.astream_events(
        {"messages": messages},
        version="v2"
    ):
        kind = event["event"]

        if kind == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            content = chunk.content
            
            if content:
                if isinstance(content, list):
                    for item in content:
                        if isinstance(item, dict):
                            if item.get("type") == "text":
                                text = item.get("text", "")
                                print(f"{Colors.GREEN}{text}{Colors.RESET}", end="", flush=True)
                                full_response.append(text)
                            elif item.get("type") == "tool_use":
                                tool_name = item.get("name", "unknown")
                                print(f"\n   {Colors.BLUE}🔧 Calling {tool_name}...{Colors.RESET}", end="", flush=True)
                elif isinstance(content, str):
                    print(f"{Colors.GREEN}{content}{Colors.RESET}", end="", flush=True)
                    full_response.append(content)
        
        elif kind == "on_tool_start":
            tool_name = event.get("name", "unknown")
            tool_input = event["data"].get("input", {})
            print(f"\n   {Colors.YELLOW}⚡ {tool_name}{Colors.RESET}", end="")
            if tool_input:
                # Show compact tool input
                compact_input = json.dumps(tool_input, ensure_ascii=False)
                if len(compact_input) > 80:
                    compact_input = compact_input[:77] + "..."
                print(f" {Colors.DIM}{compact_input}{Colors.RESET}", end="")
        
        elif kind == "on_tool_end":
            output = event["data"].get("output", "")
            # Check if tool succeeded or failed
            try:
                if hasattr(output, 'content'):
                    result = json.loads(output.content)
                    if result.get("success", True):
                        print(f" {Colors.GREEN}✓{Colors.RESET}", end="", flush=True)
                    else:
                        print(f" {Colors.RED}✗{Colors.RESET}", end="", flush=True)
                else:
                    print(f" {Colors.GREEN}✓{Colors.RESET}", end="", flush=True)
            except:
                print(f" {Colors.GREEN}✓{Colors.RESET}", end="", flush=True)
    
    print()  # New line after response
    return "".join(full_response)


async def main():
    """Run the interactive chat loop."""
    print_header()
    
    # Conversation history
    messages = []
    
    while True:
        try:
            # Get user input
            user_input = input(f"{Colors.YELLOW}You:{Colors.RESET} ").strip()
            
            # Handle special commands
            if not user_input:
                continue
            
            if user_input.lower() in ['exit', 'quit', 'q']:
                print(f"\n{Colors.CYAN}👋 Goodbye!{Colors.RESET}\n")
                break
            
            if user_input.lower() == 'clear':
                messages = []
                print(f"{Colors.DIM}✓ Conversation cleared.{Colors.RESET}\n")
                continue
            
            if user_input.lower() == 'history':
                print(f"\n{Colors.DIM}{'─' * 40}{Colors.RESET}")
                print(f"{Colors.BOLD}Conversation History ({len(messages)} messages):{Colors.RESET}")
                for i, msg in enumerate(messages):
                    role = "You" if isinstance(msg, HumanMessage) else "Project-Me"
                    content = msg.content[:100] + "..." if len(msg.content) > 100 else msg.content
                    print(f"  {i+1}. {role}: {content}")
                print(f"{Colors.DIM}{'─' * 40}{Colors.RESET}\n")
                continue
            
            # Add user message to history
            messages.append(HumanMessage(content=user_input))
            
            # Stream the response
            response_text = await stream_response(messages)
            
            # Add assistant response to history
            if response_text:
                messages.append(AIMessage(content=response_text))
            
            print()  # Extra line for readability
            
        except KeyboardInterrupt:
            print(f"\n\n{Colors.CYAN}👋 Goodbye!{Colors.RESET}\n")
            break
        except Exception as e:
            print(f"\n{Colors.RED}Error: {e}{Colors.RESET}\n")
            continue


if __name__ == "__main__":
    asyncio.run(main())
