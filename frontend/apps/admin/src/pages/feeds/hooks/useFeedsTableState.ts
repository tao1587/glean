import { useReducer, useCallback } from 'react'

export type FeedStatus = 'all' | 'active' | 'disabled' | 'error'

interface State {
  search: string
  searchInput: string
  statusFilter: FeedStatus
  page: number
  perPage: number
  selectedIds: Set<string>
}

type Action =
  | { type: 'SET_SEARCH_INPUT'; value: string }
  | { type: 'SUBMIT_SEARCH' }
  | { type: 'CLEAR_SEARCH' }
  | { type: 'SET_STATUS_FILTER'; value: FeedStatus }
  | { type: 'SET_PAGE'; page: number }
  | { type: 'SET_PER_PAGE'; perPage: number }
  | { type: 'TOGGLE_SELECTED'; id: string }
  | { type: 'SELECT_ALL'; ids: string[] }
  | { type: 'DESELECT_PAGE'; ids: string[] }
  | { type: 'CLEAR_SELECTION' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_SEARCH_INPUT':
      return { ...state, searchInput: action.value }
    case 'SUBMIT_SEARCH':
      return { ...state, search: state.searchInput, page: 1 }
    case 'CLEAR_SEARCH':
      return { ...state, search: '', searchInput: '', page: 1 }
    case 'SET_STATUS_FILTER':
      return { ...state, statusFilter: action.value, page: 1 }
    case 'SET_PAGE':
      return { ...state, page: action.page }
    case 'SET_PER_PAGE':
      return { ...state, perPage: action.perPage, page: 1 }
    case 'TOGGLE_SELECTED': {
      const next = new Set(state.selectedIds)
      if (next.has(action.id)) next.delete(action.id)
      else next.add(action.id)
      return { ...state, selectedIds: next }
    }
    case 'SELECT_ALL': {
      const next = new Set(state.selectedIds)
      action.ids.forEach((id) => next.add(id))
      return { ...state, selectedIds: next }
    }
    case 'DESELECT_PAGE': {
      const next = new Set(state.selectedIds)
      action.ids.forEach((id) => next.delete(id))
      return { ...state, selectedIds: next }
    }
    case 'CLEAR_SELECTION':
      return { ...state, selectedIds: new Set() }
    default:
      return state
  }
}

const initialState: State = {
  search: '',
  searchInput: '',
  statusFilter: 'all',
  page: 1,
  perPage: 20,
  selectedIds: new Set(),
}

export function useFeedsTableState() {
  const [state, dispatch] = useReducer(reducer, initialState)

  const setSearchInput = useCallback((value: string) => dispatch({ type: 'SET_SEARCH_INPUT', value }), [])
  const submitSearch = useCallback(() => dispatch({ type: 'SUBMIT_SEARCH' }), [])
  const clearSearch = useCallback(() => dispatch({ type: 'CLEAR_SEARCH' }), [])
  const setStatusFilter = useCallback((value: FeedStatus) => dispatch({ type: 'SET_STATUS_FILTER', value }), [])
  const setPage = useCallback((page: number) => dispatch({ type: 'SET_PAGE', page }), [])
  const setPerPage = useCallback((perPage: number) => dispatch({ type: 'SET_PER_PAGE', perPage }), [])
  const toggleSelected = useCallback((id: string) => dispatch({ type: 'TOGGLE_SELECTED', id }), [])
  const selectAll = useCallback((ids: string[]) => dispatch({ type: 'SELECT_ALL', ids }), [])
  const deselectPage = useCallback((ids: string[]) => dispatch({ type: 'DESELECT_PAGE', ids }), [])
  const clearSelection = useCallback(() => dispatch({ type: 'CLEAR_SELECTION' }), [])

  return {
    ...state,
    setSearchInput,
    submitSearch,
    clearSearch,
    setStatusFilter,
    setPage,
    setPerPage,
    toggleSelected,
    selectAll,
    deselectPage,
    clearSelection,
  }
}
