import { describe, expect, it } from 'vitest'

import {
  buildFeedFetchQueueSections,
  buildFeedFetchQueueSummary,
} from '../feed-fetch-progress'

describe('feed fetch queue helpers', () => {
  const activeRuns = [
    {
      id: 'run-current',
      feed_id: 'feed-current',
      job_id: 'job-current',
      trigger_type: 'manual_user',
      status: 'queued',
      current_stage: 'queue_wait',
      path_kind: 'direct_feed',
      profile_key: 'direct:current.example',
      queue_entered_at: '2026-04-04T08:00:00Z',
      predicted_start_at: '2026-04-04T08:02:00Z',
      predicted_finish_at: '2026-04-04T08:05:00Z',
      started_at: null,
      finished_at: null,
      summary_json: { new_entries: 0, total_entries: 0 },
      error_message: null,
      created_at: '2026-04-04T08:00:00Z',
      updated_at: '2026-04-04T08:00:00Z',
      next_fetch_at: null,
      last_fetch_attempt_at: null,
      last_fetch_success_at: null,
      last_fetched_at: null,
      stages: [],
      feed_title: 'Current feed',
      feed_url: 'https://current.example/feed.xml',
    },
    {
      id: 'run-running',
      feed_id: 'feed-running',
      job_id: 'job-running',
      trigger_type: 'scheduled',
      status: 'in_progress',
      current_stage: 'fetch_xml',
      path_kind: 'direct_feed',
      profile_key: 'direct:running.example',
      queue_entered_at: '2026-04-04T07:58:00Z',
      predicted_start_at: '2026-04-04T07:58:30Z',
      predicted_finish_at: '2026-04-04T08:01:30Z',
      started_at: '2026-04-04T07:58:30Z',
      finished_at: null,
      summary_json: { new_entries: 0, total_entries: 10 },
      error_message: null,
      created_at: '2026-04-04T07:58:00Z',
      updated_at: '2026-04-04T07:59:00Z',
      next_fetch_at: null,
      last_fetch_attempt_at: null,
      last_fetch_success_at: null,
      last_fetched_at: null,
      stages: [],
      feed_title: 'Running feed',
      feed_url: 'https://running.example/feed.xml',
    },
    {
      id: 'run-queued-one',
      feed_id: 'feed-queued-one',
      job_id: 'job-queued-one',
      trigger_type: 'scheduled',
      status: 'queued',
      current_stage: 'queue_wait',
      path_kind: 'direct_feed',
      profile_key: 'direct:queued-one.example',
      queue_entered_at: '2026-04-04T07:59:00Z',
      predicted_start_at: '2026-04-04T08:03:00Z',
      predicted_finish_at: '2026-04-04T08:06:00Z',
      started_at: null,
      finished_at: null,
      summary_json: { new_entries: 0, total_entries: 20 },
      error_message: null,
      created_at: '2026-04-04T07:59:00Z',
      updated_at: '2026-04-04T07:59:00Z',
      next_fetch_at: null,
      last_fetch_attempt_at: null,
      last_fetch_success_at: null,
      last_fetched_at: null,
      stages: [],
      feed_title: 'Queued feed one',
      feed_url: 'https://queued-one.example/feed.xml',
    },
    {
      id: 'run-queued-two',
      feed_id: 'feed-queued-two',
      job_id: 'job-queued-two',
      trigger_type: 'scheduled',
      status: 'queued',
      current_stage: 'queue_wait',
      path_kind: 'direct_feed',
      profile_key: 'direct:queued-two.example',
      queue_entered_at: '2026-04-04T08:00:30Z',
      predicted_start_at: '2026-04-04T08:04:00Z',
      predicted_finish_at: '2026-04-04T08:07:00Z',
      started_at: null,
      finished_at: null,
      summary_json: { new_entries: 0, total_entries: 30 },
      error_message: null,
      created_at: '2026-04-04T08:00:30Z',
      updated_at: '2026-04-04T08:00:30Z',
      next_fetch_at: null,
      last_fetch_attempt_at: null,
      last_fetch_success_at: null,
      last_fetched_at: null,
      stages: [],
      feed_title: 'Queued feed two',
      feed_url: 'https://queued-two.example/feed.xml',
    },
  ]

  it('groups queue items into running and queued sections', () => {
    const sections = buildFeedFetchQueueSections({
      currentRunId: 'run-current',
      activeRuns,
    })

    expect(sections).toHaveLength(2)
    expect(sections[0]).toMatchObject({
      key: 'running',
      count: 1,
    })
    expect(sections[0]?.items.map((item) => item.title)).toEqual(['Running feed'])

    expect(sections[1]).toMatchObject({
      key: 'queued',
      count: 2,
    })
    expect(sections[1]?.items.map((item) => item.title)).toEqual([
      'Queued feed one',
      'Queued feed two',
    ])
  })

  it('summarizes the active queue for the page toolbar', () => {
    const summary = buildFeedFetchQueueSummary(activeRuns)

    expect(summary).toEqual({
      totalCount: 4,
      runningCount: 1,
      queuedCount: 3,
    })
  })
})
