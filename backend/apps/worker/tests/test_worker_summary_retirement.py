"""Summary retirement keeps feed, translation, embedding and cleanup workers intact."""

from glean_worker.main import get_oss_cron_jobs, get_oss_functions


def test_worker_functions_do_not_accept_summary_jobs() -> None:
    names = {function.__name__ for function in get_oss_functions()}

    assert {"fetch_feed_task", "translate_entry_task", "generate_entry_embedding"} <= names
    assert not {"summarize_day_task", "summarize_week_task", "scheduled_daily_summaries"} & names


def test_cron_only_schedules_feed_fetch_and_read_later_cleanup() -> None:
    names = {job.coroutine.__name__ for job in get_oss_cron_jobs()}

    assert names == {"scheduled_fetch", "scheduled_cleanup"}
