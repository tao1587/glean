import { describe, expect, it } from 'vitest'
import {
  FeedStatus,
  type EntryWithState,
  type FolderTreeNode,
  type Subscription,
} from '@glean/types'
import { groupEntriesByFolder } from '@/pages/reader/shared/components/DigestView/digestHelpers'

function makeEntry(overrides: Partial<EntryWithState> = {}): EntryWithState {
  return {
    id: overrides.id ?? 'entry-1',
    feed_id: overrides.feed_id ?? 'feed-1',
    guid: overrides.guid ?? 'guid-1',
    url: overrides.url ?? 'https://example.com/1',
    title: overrides.title ?? 'Entry title',
    author: overrides.author ?? null,
    content: overrides.content ?? null,
    summary: overrides.summary ?? null,
    published_at: overrides.published_at ?? null,
    created_at: overrides.created_at ?? '2026-04-19T12:00:00.000Z',
    is_read: overrides.is_read ?? false,
    read_later: overrides.read_later ?? false,
    read_later_until: overrides.read_later_until ?? null,
    triage_state: overrides.triage_state,
    defer_until: overrides.defer_until ?? null,
    expires_at: overrides.expires_at ?? null,
    estimated_read_time_sec: overrides.estimated_read_time_sec ?? null,
    content_temporality: overrides.content_temporality,
    read_at: overrides.read_at ?? null,
    ingested_at: overrides.ingested_at ?? null,
    is_bookmarked: overrides.is_bookmarked ?? false,
    bookmark_id: overrides.bookmark_id ?? null,
    feed_title: overrides.feed_title ?? 'Feed title',
    feed_icon_url: overrides.feed_icon_url ?? null,
  }
}

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: overrides.id ?? 'subscription-1',
    user_id: overrides.user_id ?? 'user-1',
    feed_id: overrides.feed_id ?? 'feed-1',
    custom_title: overrides.custom_title ?? null,
    folder_id: overrides.folder_id ?? null,
    created_at: overrides.created_at ?? '2026-04-19T12:00:00.000Z',
    unread_count: overrides.unread_count ?? 0,
    feed: overrides.feed ?? {
      id: overrides.feed_id ?? 'feed-1',
      url: 'https://example.com/feed.xml',
      title: 'Feed title',
      site_url: null,
      description: null,
      icon_url: null,
      language: null,
      source_type: 'feed',
      status: FeedStatus.ACTIVE,
      error_count: 0,
      fetch_error_message: null,
      last_fetch_attempt_at: null,
      last_fetch_success_at: null,
      last_fetched_at: null,
      last_entry_at: null,
      created_at: '2026-04-19T12:00:00.000Z',
      updated_at: '2026-04-19T12:00:00.000Z',
    },
  }
}

describe('digestHelpers', () => {
  it('groups entries from nested folders under their top-level folder section', () => {
    const folders: FolderTreeNode[] = [
      {
        id: 'folder-parent',
        name: 'AI / 技术',
        type: 'feed',
        position: 0,
        children: [
          {
            id: 'folder-child',
            name: '子文件夹',
            type: 'feed',
            position: 0,
            children: [],
          },
        ],
      },
    ]
    const entries = [
      makeEntry({ id: 'nested-entry', feed_id: 'feed-nested' }),
      makeEntry({ id: 'unfoldered-entry', feed_id: 'feed-unfoldered' }),
    ]
    const subscriptions = [
      makeSubscription({ id: 'sub-nested', feed_id: 'feed-nested', folder_id: 'folder-child' }),
      makeSubscription({ id: 'sub-unfoldered', feed_id: 'feed-unfoldered', folder_id: null }),
    ]

    const sections = groupEntriesByFolder(entries, folders, subscriptions)

    expect(sections).toHaveLength(2)
    expect(sections[0]).toMatchObject({
      folderId: 'folder-parent',
      folderName: 'AI / 技术',
    })
    expect(sections[0].entries.map((entry) => entry.id)).toEqual(['nested-entry'])
    expect(sections[1]).toMatchObject({ folderId: null, folderName: 'Other' })
    expect(sections[1].entries.map((entry) => entry.id)).toEqual(['unfoldered-entry'])
  })
})
