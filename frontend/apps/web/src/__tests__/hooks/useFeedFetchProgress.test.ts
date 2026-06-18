import { describe, expect, it } from 'vitest'

import { mapFeedFetchRunToViewModel } from '@/hooks/useFeedFetchProgress'

describe('mapFeedFetchRunToViewModel', () => {
  it('maps queued run into inline progress model with estimated start', () => {
    const vm = mapFeedFetchRunToViewModel({
      id: 'run-1',
      feed_id: 'feed-1',
      job_id: 'job-1',
      trigger_type: 'manual_user',
      status: 'queued',
      current_stage: 'queue_wait',
      path_kind: 'direct_feed',
      profile_key: 'direct:example.com',
      queue_entered_at: '2026-04-03T08:00:00Z',
      predicted_start_at: '2026-04-03T08:01:00Z',
      predicted_finish_at: '2026-04-03T08:03:00Z',
      started_at: null,
      finished_at: null,
      summary_json: { new_entries: 0, total_entries: 0 },
      error_message: null,
      created_at: '2026-04-03T08:00:00Z',
      updated_at: '2026-04-03T08:00:00Z',
      next_fetch_at: '2026-04-03T08:15:00Z',
      last_fetch_attempt_at: null,
      last_fetch_success_at: null,
      last_fetched_at: null,
      stages: [],
    })

    expect(vm).not.toBeNull()
    expect(vm?.statusLabel).toBe('Queued')
    expect(vm?.estimatedStartLabel).toBeTruthy()
    expect(vm?.progressPercent).toBe(0)
  })
})
