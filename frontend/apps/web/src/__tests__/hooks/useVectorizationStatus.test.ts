import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createQueryWrapper } from '../helpers/queryWrapper'

vi.mock('@glean/api-client', () => ({
  systemService: {
    getVectorizationStatus: vi.fn(),
  },
  VectorizationStatus: {},
}))

import {
  useVectorizationStatus,
  useIsVectorizationOperational,
  useIsVectorizationEnabled,
} from '@/hooks/useVectorizationStatus'
import { systemService } from '@glean/api-client'

describe('useVectorizationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch vectorization status', async () => {
    const status = {
      enabled: true,
      status: 'idle' as const,
      has_error: false,
      error_message: null,
      rebuild_progress: null,
    }
    vi.mocked(systemService.getVectorizationStatus).mockResolvedValue(status)
    const { wrapper } = createQueryWrapper()

    const { result } = renderHook(() => useVectorizationStatus(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(status)
  })
})

describe('useIsVectorizationOperational', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return true when enabled and idle', async () => {
    vi.mocked(systemService.getVectorizationStatus).mockResolvedValue({
      enabled: true,
      status: 'idle',
      has_error: false,
      error_message: null,
      rebuild_progress: null,
    })
    const { wrapper } = createQueryWrapper()

    const { result } = renderHook(() => useIsVectorizationOperational(), { wrapper })

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('should return false when disabled', async () => {
    vi.mocked(systemService.getVectorizationStatus).mockResolvedValue({
      enabled: false,
      status: 'disabled',
      has_error: false,
      error_message: null,
      rebuild_progress: null,
    })
    const { wrapper } = createQueryWrapper()

    const { result } = renderHook(() => useIsVectorizationOperational(), { wrapper })

    await waitFor(() => expect(result.current).toBeFalsy())
  })

  it('should return false when enabled but rebuilding', async () => {
    vi.mocked(systemService.getVectorizationStatus).mockResolvedValue({
      enabled: true,
      status: 'rebuilding',
      has_error: false,
      error_message: null,
      rebuild_progress: { total: 100, pending: 50, processing: 10, done: 40, failed: 0 },
    })
    const { wrapper } = createQueryWrapper()

    const { result } = renderHook(() => useIsVectorizationOperational(), { wrapper })

    await waitFor(() => expect(result.current).toBeFalsy())
  })
})

describe('useIsVectorizationEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return true when enabled', async () => {
    vi.mocked(systemService.getVectorizationStatus).mockResolvedValue({
      enabled: true,
      status: 'idle',
      has_error: false,
      error_message: null,
      rebuild_progress: null,
    })
    const { wrapper } = createQueryWrapper()

    const { result } = renderHook(() => useIsVectorizationEnabled(), { wrapper })

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('should return false when disabled', async () => {
    vi.mocked(systemService.getVectorizationStatus).mockResolvedValue({
      enabled: false,
      status: 'disabled',
      has_error: false,
      error_message: null,
      rebuild_progress: null,
    })
    const { wrapper } = createQueryWrapper()

    const { result } = renderHook(() => useIsVectorizationEnabled(), { wrapper })

    await waitFor(() => expect(result.current).toBe(false))
  })
})
