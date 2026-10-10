"""
Worker configuration management.

This module defines configuration settings for the background worker.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Worker configuration settings.

    Attributes:
        database_url: PostgreSQL connection URL.
        redis_url: Redis connection URL for task queue.
        worker_job_timeout_seconds: Per-job timeout in seconds for arq worker.
        worker_max_jobs: Maximum concurrent arq jobs for the worker process.
        feed_refresh_interval_minutes: Default delay before the next scheduled feed refresh.
    """

    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://glean:changeme@localhost:5432/glean"
    redis_url: str = "redis://localhost:6379/0"
    worker_job_timeout_seconds: int = 1800
    worker_max_jobs: int = 4
    feed_refresh_interval_minutes: int = 720
    worker_timezone: str = "UTC"

@lru_cache
def get_settings() -> Settings:
    """
    Get cached worker settings.

    Returns:
        Singleton Settings instance.
    """
    return Settings()


settings = get_settings()
