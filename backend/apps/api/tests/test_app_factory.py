"""Tests for FastAPI app factory isolation behavior."""

from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.routing import Mount

from glean_api.main import create_app
from glean_api.middleware.logging import LoggingMiddleware


def _get_mcp_mount_app(app) -> object:
    for route in app.routes:
        if isinstance(route, Mount) and route.path == "/mcp":
            return route.app
    raise AssertionError("MCP mount not found")


def test_create_app_builds_independent_mcp_mounts() -> None:
    """Factory should return apps with isolated MCP server mounts."""
    app_one = create_app()
    app_two = create_app()

    mcp_app_one = _get_mcp_mount_app(app_one)
    mcp_app_two = _get_mcp_mount_app(app_two)

    assert mcp_app_one is not mcp_app_two


def test_health_check_success_is_not_logged_at_info() -> None:
    """Routine health probes should stay out of info logs."""
    app = FastAPI()
    app.add_middleware(LoggingMiddleware)

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    context_logger = patch("glean_api.middleware.logging.logger.bind")

    with TestClient(app) as client, context_logger as mock_bind:
        bound_logger = mock_bind.return_value
        response = client.get("/api/health")

    assert response.status_code == 200
    bound_logger.info.assert_not_called()
    bound_logger.warning.assert_not_called()


def test_regular_success_is_not_logged_at_info() -> None:
    """Routine successful API requests should not emit info logs."""
    app = FastAPI()
    app.add_middleware(LoggingMiddleware)

    @app.get("/api/system/health")
    async def system_health() -> dict[str, str]:
        return {"status": "ok"}

    context_logger = patch("glean_api.middleware.logging.logger.bind")

    with TestClient(app) as client, context_logger as mock_bind:
        bound_logger = mock_bind.return_value
        response = client.get("/api/system/health")

    assert response.status_code == 200
    bound_logger.info.assert_not_called()
    bound_logger.warning.assert_not_called()
