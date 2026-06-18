import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

interface Entry {
  id: string
  feed_id: string
  feed_title: string
  url: string
  title: string
  author: string | null
  content_backfill_status: 'pending' | 'processing' | 'done' | 'failed' | 'skipped' | null
  content_backfill_attempts: number
  content_backfill_error: string | null
  content_source: string | null
  published_at: string | null
  created_at: string
}

interface EntryDetail extends Entry {
  content: string | null
  summary: string | null
}

interface EntryListResponse {
  items: Entry[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

interface EntryListParams {
  page?: number
  per_page?: number
  feed_id?: string
  search?: string
  sort?: string
  order?: string
}

export function useEntries(params: EntryListParams = {}) {
  return useQuery<EntryListResponse>({
    queryKey: ['admin', 'entries', params],
    queryFn: async () => {
      const response = await api.get('/entries', { params })
      return response.data
    },
  })
}

/** Thin wrapper returning only { items, total, isLoading } — use instead of useEntries when the full response is not needed. */
export function useEntryList(params: EntryListParams = {}) {
  return useQuery<EntryListResponse, Error, { items: Entry[]; total: number }>({
    queryKey: ['admin', 'entries', params],
    queryFn: async () => {
      const response = await api.get('/entries', { params })
      return response.data
    },
    select: (data) => ({ items: data.items, total: data.total }),
  })
}

export function useEntry(entryId: string | null) {
  return useQuery<EntryDetail>({
    queryKey: ['admin', 'entry', entryId],
    queryFn: async () => {
      const response = await api.get(`/entries/${entryId}`)
      return response.data
    },
    enabled: !!entryId,
  })
}

export function useDeleteEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (entryId: string) => {
      await api.delete(`/entries/${entryId}`)
      return entryId
    },
    onSuccess: (entryId: string) => {
      queryClient.setQueriesData<EntryListResponse>(
        { queryKey: ['admin', 'entries'] },
        (old) => {
          if (!old) return old
          const items = old.items.filter((e) => e.id !== entryId)
          const removed = old.items.length - items.length
          return { ...old, items, total: old.total - removed }
        },
      )
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'entries'] })
    },
  })
}

export function useBatchEntryOperation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ action, entryIds }: { action: string; entryIds: string[] }) => {
      const response = await api.post('/entries/batch', { action, entry_ids: entryIds })
      return response.data as { deleted_ids?: string[] }
    },
    onSuccess: (result: { deleted_ids?: string[] }) => {
      if (result.deleted_ids?.length) {
        const deletedSet = new Set(result.deleted_ids)
        queryClient.setQueriesData<EntryListResponse>(
          { queryKey: ['admin', 'entries'] },
          (old) => {
            if (!old) return old
            const filtered = old.items.filter((e) => !deletedSet.has(e.id))
            return {
              ...old,
              items: filtered,
              total: old.total - (old.items.length - filtered.length),
            }
          },
        )
      } else {
        // For non-delete batch ops (if any), invalidate to get authoritative state
        queryClient.invalidateQueries({ queryKey: ['admin', 'entries'] })
      }
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'entries'] })
    },
  })
}
