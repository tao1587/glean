"""
Glean MCP Server.

Model Context Protocol server for exposing Glean functionality to LLM clients.
"""

from .server import create_mcp_server

__all__ = ["create_mcp_server"]
