"""Schemas for the internal-trigger AI flow.

Previously hosted external-writeback DTOs for the retired per-article and
today-entries endpoints. Those were removed when we moved to internal-only
triggers. What remains is the parsed-LLM-output payload types used by the
worker.
"""

from pydantic import BaseModel, Field


def _string_list_factory() -> list[str]:
    return []


class SynthesisTopic(BaseModel):
    name: str
    entry_ids: list[str] = Field(default_factory=_string_list_factory)


class SynthesisHighlight(BaseModel):
    entry_id: str
    reason: str


class SynthesisPayload(BaseModel):
    """Parsed LLM output for a daily reading-list synthesis."""

    title: str
    summary: str
    topics: list[SynthesisTopic] = Field(default_factory=list)
    highlights: list[SynthesisHighlight] = Field(default_factory=list)
    recommended_entry_ids: list[str] = Field(default_factory=_string_list_factory)
    input_tokens: int | None = None
    output_tokens: int | None = None
