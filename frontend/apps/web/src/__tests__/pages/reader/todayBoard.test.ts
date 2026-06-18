import { describe, expect, it } from 'vitest'
import type { EntryWithState } from '@glean/types'
import {
  buildRecentTodayBoardDates,
  getEffectiveEntryTimestamp,
  buildTodayBoardEntries,
  buildTodayBoardGroups,
  getTodayBoardCollectionRange,
  getTodayBoardDateKey,
  getTodayCollectionRange,
  resolveTodayBoardDateParam,
} from '@/pages/reader/shared/todayBoard'

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

describe('todayBoard helpers', () => {
  it('builds local date keys and selectable recent days for the today board calendar', () => {
    const now = new Date('2026-04-10T12:34:56+08:00')

    expect(getTodayBoardDateKey(now)).toBe('2026-04-10')

    const recentDays = buildRecentTodayBoardDates(now)

    expect(recentDays).toHaveLength(30)
    expect(recentDays[0]).toMatchObject({
      key: '2026-04-10',
      isToday: true,
    })
    expect(recentDays[1]).toMatchObject({
      key: '2026-04-09',
      isToday: false,
    })
    expect(recentDays[29]).toMatchObject({
      key: '2026-03-12',
      isToday: false,
    })
  })

  it('resolves today board URL date params against the recent selectable window', () => {
    const now = new Date('2026-04-10T12:34:56+08:00')

    expect(resolveTodayBoardDateParam('2026-04-07', now)).toBe('2026-04-07')
    expect(resolveTodayBoardDateParam('2026-04-10', now)).toBe('2026-04-10')
    expect(resolveTodayBoardDateParam(null, now)).toBe('2026-04-10')
    expect(resolveTodayBoardDateParam('2026-03-01', now)).toBe('2026-04-10')
    expect(resolveTodayBoardDateParam('2026-4-7', now)).toBe('2026-04-10')
    expect(resolveTodayBoardDateParam('not-a-date', now)).toBe('2026-04-10')
  })

  it('builds an inclusive-exclusive local day range for a selected date', () => {
    const range = getTodayBoardCollectionRange('2026-04-07')

    expect(range).toEqual({
      collected_after: '2026-04-06T16:00:00.000Z',
      collected_before: '2026-04-07T16:00:00.000Z',
    })
  })

  it('builds an inclusive-exclusive local day range for collection queries', () => {
    const range = getTodayCollectionRange(new Date('2026-04-10T12:34:56+08:00'))

    expect(range).toEqual({
      collected_after: '2026-04-09T16:00:00.000Z',
      collected_before: '2026-04-10T16:00:00.000Z',
    })
  })

  it('prefers published_at over ingested_at when choosing the effective timestamp', () => {
    const entry = makeEntry({
      published_at: '2026-04-09T23:00:00.000Z',
      ingested_at: '2026-04-10T01:00:00.000Z',
      created_at: '2026-04-10T01:00:00.000Z',
    })

    expect(getEffectiveEntryTimestamp(entry)?.toISOString()).toBe('2026-04-09T23:00:00.000Z')
  })

  it('falls back to ingested_at and then created_at when published_at is missing', () => {
    const withIngestedAt = makeEntry({
      published_at: null,
      ingested_at: '2026-04-10T05:00:00.000Z',
      created_at: '2026-04-10T02:00:00.000Z',
    })
    const withCreatedAtOnly = makeEntry({
      id: 'entry-2',
      published_at: null,
      ingested_at: null,
      created_at: '2026-04-10T03:00:00.000Z',
    })

    expect(getEffectiveEntryTimestamp(withIngestedAt)?.toISOString()).toBe('2026-04-10T05:00:00.000Z')
    expect(getEffectiveEntryTimestamp(withCreatedAtOnly)?.toISOString()).toBe(
      '2026-04-10T03:00:00.000Z'
    )
  })

  it('uses collection time for today membership and sorts unread before read, newest first within each group', () => {
    const now = new Date('2026-04-10T12:00:00+08:00')

    const results = buildTodayBoardEntries(
      [
        makeEntry({
          id: 'read-newest',
          is_read: true,
          published_at: '2026-04-10T11:00:00+08:00',
        }),
        makeEntry({
          id: 'unread-older',
          is_read: false,
          published_at: '2026-04-10T09:00:00+08:00',
          ingested_at: '2026-04-10T09:00:00+08:00',
          created_at: '2026-04-10T09:00:00+08:00',
        }),
        makeEntry({
          id: 'unread-newest',
          is_read: false,
          published_at: '2026-04-10T10:00:00+08:00',
          ingested_at: '2026-04-10T10:00:00+08:00',
          created_at: '2026-04-10T10:00:00+08:00',
        }),
        makeEntry({
          id: 'fallback-ingested',
          is_read: false,
          published_at: null,
          ingested_at: '2026-04-10T08:30:00+08:00',
          created_at: '2026-04-08T08:30:00+08:00',
        }),
        makeEntry({
          id: 'published-yesterday-ingested-today',
          is_read: false,
          published_at: '2026-04-09T12:30:00+08:00',
          ingested_at: '2026-04-10T01:00:00+08:00',
        }),
      ],
      {
        now,
        getFeedDescription: (feedId) => (feedId === 'feed-1' ? 'Feed summary text' : null),
      }
    )

    expect(results.map((entry) => entry.id)).toEqual([
      'unread-newest',
      'unread-older',
      'fallback-ingested',
      'published-yesterday-ingested-today',
      'read-newest',
    ])
    expect(results.every((entry) => entry.feed_description === 'Feed summary text')).toBe(true)
  })

  it('uses the selected date for membership when building today-board entries', () => {
    const results = buildTodayBoardEntries(
      [
        makeEntry({
          id: 'selected-day-entry',
          ingested_at: '2026-04-07T09:00:00+08:00',
          created_at: '2026-04-07T09:00:00+08:00',
        }),
        makeEntry({
          id: 'today-entry',
          ingested_at: '2026-04-10T09:00:00+08:00',
          created_at: '2026-04-10T09:00:00+08:00',
        }),
      ],
      {
        selectedDate: '2026-04-07',
      }
    )

    expect(results.map((entry) => entry.id)).toEqual(['selected-day-entry'])
  })

  it('groups today-board entries by feed and exposes unread and total counts', () => {
    const now = new Date('2026-04-10T12:00:00+08:00')
    const entries = buildTodayBoardEntries(
      [
        makeEntry({
          id: 'feed-a-new',
          feed_id: 'feed-a',
          feed_title: 'Feed A',
          ingested_at: '2026-04-10T10:00:00+08:00',
        }),
        makeEntry({
          id: 'feed-b-new',
          feed_id: 'feed-b',
          feed_title: 'Feed B',
          ingested_at: '2026-04-10T09:00:00+08:00',
        }),
        makeEntry({
          id: 'feed-a-read',
          feed_id: 'feed-a',
          feed_title: 'Feed A',
          is_read: true,
          ingested_at: '2026-04-10T11:00:00+08:00',
        }),
      ],
      { now }
    )

    const groups = buildTodayBoardGroups(entries)

    expect(groups.map((group) => group.feedId)).toEqual(['feed-a', 'feed-b'])
    expect(groups[0]).toMatchObject({
      feedTitle: 'Feed A',
      unreadCount: 1,
      totalCount: 2,
    })
    expect(groups[0].entries.map((entry) => entry.id)).toEqual(['feed-a-new', 'feed-a-read'])
  })

  it('shows at most three unread entries and hides read entries while a feed group is collapsed', () => {
    const now = new Date('2026-04-10T12:00:00+08:00')
    const entries = buildTodayBoardEntries(
      [
        makeEntry({ id: 'unread-1', ingested_at: '2026-04-10T11:00:00+08:00' }),
        makeEntry({ id: 'unread-2', ingested_at: '2026-04-10T10:00:00+08:00' }),
        makeEntry({ id: 'unread-3', ingested_at: '2026-04-10T09:00:00+08:00' }),
        makeEntry({ id: 'unread-4', ingested_at: '2026-04-10T08:00:00+08:00' }),
        makeEntry({ id: 'read-1', is_read: true, ingested_at: '2026-04-10T12:00:00+08:00' }),
      ],
      { now }
    )

    const [group] = buildTodayBoardGroups(entries)

    expect(group.visibleEntries.map((entry) => entry.id)).toEqual([
      'unread-1',
      'unread-2',
      'unread-3',
    ])
    expect(group.isCollapsible).toBe(true)
  })

  it('moves completed feed groups after unread groups and shows up to three read entries by default', () => {
    const now = new Date('2026-04-10T12:00:00+08:00')
    const entries = buildTodayBoardEntries(
      [
        makeEntry({
          id: 'completed-read-1',
          feed_id: 'completed-feed',
          feed_title: 'Completed feed',
          is_read: true,
          ingested_at: '2026-04-10T12:00:00+08:00',
        }),
        makeEntry({
          id: 'completed-read-2',
          feed_id: 'completed-feed',
          feed_title: 'Completed feed',
          is_read: true,
          ingested_at: '2026-04-10T11:00:00+08:00',
        }),
        makeEntry({
          id: 'completed-read-3',
          feed_id: 'completed-feed',
          feed_title: 'Completed feed',
          is_read: true,
          ingested_at: '2026-04-10T10:00:00+08:00',
        }),
        makeEntry({
          id: 'completed-read-4',
          feed_id: 'completed-feed',
          feed_title: 'Completed feed',
          is_read: true,
          ingested_at: '2026-04-10T09:00:00+08:00',
        }),
        makeEntry({
          id: 'active-unread',
          feed_id: 'active-feed',
          feed_title: 'Active feed',
          is_read: false,
          ingested_at: '2026-04-10T08:00:00+08:00',
        }),
      ],
      { now }
    )

    const groups = buildTodayBoardGroups(entries)

    expect(groups.map((group) => group.feedId)).toEqual(['active-feed', 'completed-feed'])
    expect(groups[1]).toMatchObject({
      unreadCount: 0,
      totalCount: 4,
      isCollapsible: true,
    })
    expect(groups[1].visibleEntries.map((entry) => entry.id)).toEqual([
      'completed-read-1',
      'completed-read-2',
      'completed-read-3',
    ])
  })

  it('shows all feed entries when expanded and keeps the selected entry visible while collapsed', () => {
    const now = new Date('2026-04-10T12:00:00+08:00')
    const entries = buildTodayBoardEntries(
      [
        makeEntry({ id: 'unread-1', ingested_at: '2026-04-10T11:00:00+08:00' }),
        makeEntry({ id: 'unread-2', ingested_at: '2026-04-10T10:00:00+08:00' }),
        makeEntry({ id: 'unread-3', ingested_at: '2026-04-10T09:00:00+08:00' }),
        makeEntry({ id: 'unread-4', ingested_at: '2026-04-10T08:00:00+08:00' }),
        makeEntry({ id: 'read-selected', is_read: true, ingested_at: '2026-04-10T12:00:00+08:00' }),
      ],
      { now }
    )

    const [expandedGroup] = buildTodayBoardGroups(entries, {
      expandedFeedIds: new Set(['feed-1']),
    })
    const [collapsedWithSelected] = buildTodayBoardGroups(entries, {
      selectedEntryId: 'read-selected',
    })

    expect(expandedGroup.visibleEntries.map((entry) => entry.id)).toEqual([
      'unread-1',
      'unread-2',
      'unread-3',
      'unread-4',
      'read-selected',
    ])
    expect(collapsedWithSelected.visibleEntries.map((entry) => entry.id)).toContain('read-selected')
  })
})
