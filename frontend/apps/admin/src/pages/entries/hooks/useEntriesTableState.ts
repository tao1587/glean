import { useReducer, useCallback } from 'react'

interface State {
  page: number
  search: string
  searchInput: string
  feedFilter: string
  selectedEntryId: string | null
  deleteEntryId: string | null
}

type Action =
  | { type: 'SET_PAGE'; page: number | ((p: number) => number) }
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'SET_SEARCH_INPUT'; input: string }
  | { type: 'SET_FEED_FILTER'; feedId: string }
  | { type: 'SET_SELECTED_ENTRY_ID'; id: string | null }
  | { type: 'SET_DELETE_ENTRY_ID'; id: string | null }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_PAGE': {
      const page = typeof action.page === 'function' ? action.page(state.page) : action.page
      return { ...state, page }
    }
    case 'SET_SEARCH':
      return { ...state, search: action.search }
    case 'SET_SEARCH_INPUT':
      return { ...state, searchInput: action.input }
    case 'SET_FEED_FILTER':
      return { ...state, feedFilter: action.feedId }
    case 'SET_SELECTED_ENTRY_ID':
      return { ...state, selectedEntryId: action.id }
    case 'SET_DELETE_ENTRY_ID':
      return { ...state, deleteEntryId: action.id }
    default:
      return state
  }
}

const initialState: State = {
  page: 1,
  search: '',
  searchInput: '',
  feedFilter: '',
  selectedEntryId: null,
  deleteEntryId: null,
}

export function useEntriesTableState() {
  const [state, dispatch] = useReducer(reducer, initialState)

  const setPage = useCallback(
    (page: number | ((p: number) => number)) => dispatch({ type: 'SET_PAGE', page }),
    [],
  )
  const setSearch = useCallback((search: string) => dispatch({ type: 'SET_SEARCH', search }), [])
  const setSearchInput = useCallback(
    (input: string) => dispatch({ type: 'SET_SEARCH_INPUT', input }),
    [],
  )
  const setFeedFilter = useCallback(
    (feedId: string) => dispatch({ type: 'SET_FEED_FILTER', feedId }),
    [],
  )
  const setSelectedEntryId = useCallback(
    (id: string | null) => dispatch({ type: 'SET_SELECTED_ENTRY_ID', id }),
    [],
  )
  const setDeleteEntryId = useCallback(
    (id: string | null) => dispatch({ type: 'SET_DELETE_ENTRY_ID', id }),
    [],
  )

  return {
    page: state.page,
    search: state.search,
    searchInput: state.searchInput,
    feedFilter: state.feedFilter,
    selectedEntryId: state.selectedEntryId,
    deleteEntryId: state.deleteEntryId,
    setPage,
    setSearch,
    setSearchInput,
    setFeedFilter,
    setSelectedEntryId,
    setDeleteEntryId,
  }
}
