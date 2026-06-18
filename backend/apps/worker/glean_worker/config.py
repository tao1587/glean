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

    # LLM / AI summarization (mirrors API config; worker calls the LLM directly)
    llm_api_key: str | None = None
    llm_base_url: str = "https://api.deepseek.com"
    llm_model: str = "deepseek-v4-flash"
    llm_prompt_version: str = "v1"
    llm_target_language: str | None = None
    llm_extra_params: str = "{}"
    llm_max_input_chars: int = 6000
    llm_max_input_chars_daily: int = 1500
    summary_cron_hours: str = "6,12,18,22"
    llm_max_output_tokens_summarize: int = 500
    llm_max_output_tokens_synthesize: int = 1500
    llm_request_timeout_seconds: int = 60
    llm_smoke_check_enabled: bool = True
    llm_synthesis_enabled: bool = True


@lru_cache
def get_settings() -> Settings:
    """
    Get cached worker settings.

    Returns:
        Singleton Settings instance.
    """
    return Settings()


settings = get_settings()
