import { describe, expect, it } from 'vitest'
import type { EntryWithState } from '@glean/types'
import { buildTodayBoardEntries, buildTodayBoardGroups } from '@/pages/reader/shared/todayBoard'

function makeEntry(overrides: Partial<EntryWithState> = {}): EntryWithState {
  return {
    id: overrides.id ?? 'entry-1',
    feed_id: overrides.feed_id ?? 'feed-1',
    guid: overrides.guid ?? 'guid-1',
    url: overrides.url ?? 'https://example.com/1',
    title: overrides.title ?? 'Entry title',
    author: overrides.author ?? null,
    content: overrides.content ?? null,
    summary: overrides.summary ?? 'Entry summary',
    published_at: overrides.published_at ?? null,
    created_at: overrides.created_at ?? '2026-04-10T02:00:00.000Z',
    is_read: overrides.is_read ?? false,
    read_later: overrides.read_later ?? false,
    is_hidden: overrides.is_hidden ?? false,
    read_later_until: overrides.read_later_until ?? null,
    triage_state: overrides.triage_state,
    defer_until: overrides.defer_until ?? null,
    expires_at: overrides.expires_at ?? null,
    estimated_read_time_sec: overrides.estimated_read_time_sec ?? null,
    content_temporality: overrides.content_temporality,
    read_at: overrides.read_at ?? null,
    ingested_at: overrides.ingested_at ?? overrides.created_at ?? '2026-04-10T02:00:00.000Z',
    is_bookmarked: overrides.is_bookmarked ?? false,
    bookmark_id: overrides.bookmark_id ?? null,
    feed_title: overrides.feed_title ?? 'Feed title',
    feed_icon_url: overrides.feed_icon_url ?? null,
  }
}

/** Build 5 unread entries on the same feed, then convert to TodayBoardEntry[]. */
function makeFiveUnreadEntries() {
  const rawEntries = Array.from({ length: 5 }, (_, i) =>
    makeEntry({
      id: `entry-${i + 1}`,
      feed_id: 'feed-1',
      is_read: false,
      ingested_at: `2026-04-10T0${i + 1}:00:00.000Z`,
      created_at: `2026-04-10T0${i + 1}:00:00.000Z`,
    })
  )
  // buildTodayBoardEntries with filterBySelectedDate:false so all pass through
  return buildTodayBoardEntries(rawEntries, { filterBySelectedDate: false })
}

describe('buildTodayBoardGroups — visibleUnreadLimit', () => {
  it('caps visibleEntries at 3 by default (documents the existing default)', () => {
    const entries = makeFiveUnreadEntries()
    const groups = buildTodayBoardGroups(entries)

    expect(groups).toHaveLength(1)
    // 5 unread entries exist, but without the option only 3 are visible
    expect(groups[0]!.unreadCount).toBe(5)
    expect(groups[0]!.visibleEntries).toHaveLength(3)
  })

  it('shows all 5 unread entries when visibleUnreadLimit is POSITIVE_INFINITY (PeriodView contract)', () => {
    const entries = makeFiveUnreadEntries()
    const groups = buildTodayBoardGroups(entries, {
      visibleUnreadLimit: Number.POSITIVE_INFINITY,
    })

    expect(groups).toHaveLength(1)
    expect(groups[0]!.unreadCount).toBe(5)
    // All 5 unread entries must be visible — no silent cap
    expect(groups[0]!.visibleEntries).toHaveLength(5)
  })
})
