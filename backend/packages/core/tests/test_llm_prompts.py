"""Tests for prompt template assembly."""



def test_build_daily_summary_messages_wraps_articles():
    from glean_core.services.llm.prompts import build_daily_summary_messages
    msgs = build_daily_summary_messages(
        items=[{"entry_id": "e1", "title": "T", "content": "body text"}],
        target_language="zh",
    )
    assert msgs[0]["role"] == "system"
    assert "zh" in msgs[0]["content"]
    assert "entry_id=e1" in msgs[1]["content"]
    assert "body text" in msgs[1]["content"]
    assert "<ARTICLES>" in msgs[1]["content"]

def test_build_weekly_summary_messages_reduces_dailies():
    from glean_core.services.llm.prompts import build_weekly_summary_messages
    msgs = build_weekly_summary_messages(
        items=[{"date": "2026-06-08", "title": "Mon", "summary": "s", "topics": ["a"]}],
        target_language="en",
    )
    assert "<DAILIES>" in msgs[1]["content"]
    assert "Mon" in msgs[1]["content"]
