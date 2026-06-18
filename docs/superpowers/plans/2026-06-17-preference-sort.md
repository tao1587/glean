# Preference Sort (Source-Affinity) — Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Spec:** [2026-06-17-week-month-reading-views-design.md](../specs/2026-06-17-week-month-reading-views-design.md) — **NOTE:** this plan supersedes the spec's *embedding-similarity* preference score. Per the 2026-06-17 decision, the embedding/vector subsystem is dormant (no ORM models; `entry_embeddings` empty against 6k+ entries), so `按兴趣` is implemented as a **transparent per-source affinity** ranking with **no embeddings, no new tables, no ML**.

**Goal:** Add an optional, non-destructive `按兴趣` sort to the Week/Month view that orders source sections by the user's own per-source engagement (read/saved positive, hidden negative); default stays `时间`.

**Architecture:** A backend SQL aggregation over existing `user_entries` state yields a per-feed affinity score for the user. The frontend fetches that map, adds a `时间 / 按兴趣` masthead toggle (URL `?sort=`), and in `按兴趣` mode reorders the source **sections** by affinity (descending); within-source order is unchanged. Purely additive and non-destructive — it only reorders sections, never hides anything, and `时间` is the default so an empty/odd affinity map can never block reading.

**Tech Stack:** Python/FastAPI/SQLAlchemy async/pytest; React/TS/TanStack Query/vitest.

---

## File Structure

**Backend (modify):**
- `backend/packages/core/glean_core/services/entry_service.py` — `get_source_affinity`.
- `backend/packages/core/glean_core/schemas/entry.py` — `SourceAffinityResponse`.
- `backend/apps/api/glean_api/routers/entries.py` — `GET /entries/source-affinity`.
- `backend/tests/integration/test_entries_api.py` — tests.

**Frontend (modify):**
- `frontend/packages/types/src/api.ts` — `SourceAffinityResponse`.
- `frontend/packages/api-client/src/services/entries.ts` — `getSourceAffinity`.
- `frontend/apps/web/src/hooks/useEntries.ts` — `useSourceAffinity`.
- `frontend/apps/web/src/pages/reader/shared/useReaderController.ts` — `sort` state.
- `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx` — pass `sort`/`setSort`/affinity.
- `frontend/apps/web/src/pages/reader/shared/components/PeriodView/index.tsx` — toggle + section ordering.

---

## Task 1 — Backend: source-affinity aggregation + endpoint (TDD)

**Files:**
- Test: `backend/tests/integration/test_entries_api.py`
- Modify: `entry_service.py`, `schemas/entry.py`, `routers/entries.py`

- [ ] **Step 1: Write the failing API test**

Append to `test_entries_api.py` (reuse existing `client`, `auth_headers`, `test_entries`, `db_session`, `test_user` fixtures):

```python
class TestSourceAffinity:
    @pytest.mark.asyncio
    async def test_affinity_reflects_engagement(
        self, client: AsyncClient, auth_headers, test_entries, test_feed
    ):
        # read entry 0, hide entry 1 (same feed)
        await client.patch(f"/api/entries/{test_entries[0].id}", headers=auth_headers, json={"is_read": True})
        await client.patch(f"/api/entries/{test_entries[1].id}", headers=auth_headers, json={"is_hidden": True})
        resp = await client.get("/api/entries/source-affinity", headers=auth_headers)
        assert resp.status_code == 200
        affinity = resp.json()["affinity"]
        # one read (+1) and one hide (-1) on the same feed => net 0
        assert affinity.get(str(test_feed.id)) == 0

    @pytest.mark.asyncio
    async def test_affinity_empty_when_no_interactions(self, client: AsyncClient, auth_headers, test_entries):
        resp = await client.get("/api/entries/source-affinity", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["affinity"] == {}
```

- [ ] **Step 2: Run, verify fail** — `cd backend && uv run pytest tests/integration/test_entries_api.py::TestSourceAffinity -v` → FAIL (endpoint missing).

- [ ] **Step 3: Add the schema** — in `schemas/entry.py`:

```python
class SourceAffinityResponse(BaseModel):
    """Per-feed engagement affinity for the current user (feed_id -> score)."""
    affinity: dict[str, float] = Field(default_factory=dict)
```

(Add `from pydantic import Field` if not already imported.)

- [ ] **Step 4: Add the service method** — in `entry_service.py` (uses existing `Entry`, `UserEntry`, `Subscription`, `select`, `func` imports):

```python
    async def get_source_affinity(self, user_id: str) -> dict[str, float]:
        """Per-feed affinity from this user's engagement: reads + saves - hides.

        Transparent, no ML: aggregates existing UserEntry state grouped by feed.
        Feeds with no interaction are simply absent (treated as 0 by callers).
        """
        stmt = (
            select(
                Entry.feed_id,
                func.count().filter(UserEntry.is_read.is_(True)).label("reads"),
                func.count().filter(UserEntry.read_later.is_(True)).label("saves"),
                func.count().filter(UserEntry.is_hidden.is_(True)).label("hides"),
            )
            .join(UserEntry, UserEntry.entry_id == Entry.id)
            .where(UserEntry.user_id == user_id)
            .group_by(Entry.feed_id)
        )
        result = await self.session.execute(stmt)
        return {
            str(feed_id): float((reads or 0) + (saves or 0) - (hides or 0))
            for feed_id, reads, saves, hides in result.all()
        }
```

- [ ] **Step 5: Add the endpoint** — in `routers/entries.py`, import `SourceAffinityResponse` from `glean_core.schemas`, and add (place it ABOVE the `/{entry_id}` route so it isn't captured as an entry id):

```python
@router.get("/source-affinity")
async def get_source_affinity(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    entry_service: Annotated[EntryService, Depends(get_entry_service)],
) -> SourceAffinityResponse:
    """Per-feed engagement affinity for the current user (used by the 按兴趣 sort)."""
    affinity = await entry_service.get_source_affinity(current_user.id)
    return SourceAffinityResponse(affinity=affinity)
```

Also export `SourceAffinityResponse` from `glean_core/schemas/__init__.py` if that package re-exports schemas (match how `EntryListResponse` etc. are exported there).

- [ ] **Step 6: Run, verify pass** — `cd backend && uv run pytest tests/integration/test_entries_api.py::TestSourceAffinity -v` → PASS (2). Then `uv run pytest tests/integration/test_entries_api.py -q` → no regressions. Then `make lint`.

- [ ] **Step 7: Commit**

```bash
git add backend/packages/core/glean_core/services/entry_service.py \
        backend/packages/core/glean_core/schemas/entry.py \
        backend/packages/core/glean_core/schemas/__init__.py \
        backend/apps/api/glean_api/routers/entries.py \
        backend/tests/integration/test_entries_api.py
git commit -m "feat(api): source-affinity aggregation endpoint"
```

---

## Task 2 — Frontend: types + api-client + hook

**Files:** `frontend/packages/types/src/api.ts`, `frontend/packages/api-client/src/services/entries.ts`, `frontend/apps/web/src/hooks/useEntries.ts`

- [ ] **Step 1: Type** — in `api.ts`:

```ts
export interface SourceAffinityResponse {
  affinity: Record<string, number>
}
```

- [ ] **Step 2: api-client** — in `entries.ts`, import `SourceAffinityResponse` from `@glean/types` and add to `EntryService`:

```ts
  async getSourceAffinity(options?: { signal?: AbortSignal }): Promise<SourceAffinityResponse> {
    return this.client.get<SourceAffinityResponse>('/entries/source-affinity', { signal: options?.signal })
  }
```

- [ ] **Step 3: hook** — in `useEntries.ts`:

```ts
export function useSourceAffinity(enabled: boolean) {
  return useQuery({
    queryKey: ['source-affinity'],
    queryFn: ({ signal }) => entryService.getSourceAffinity({ signal }),
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  })
}
```

- [ ] **Step 4: Typecheck + commit**

`pnpm --dir frontend run typecheck` → clean.

```bash
git commit -am "feat(client): useSourceAffinity hook"
```

---

## Task 3 — Frontend: sort state in the controller

**Files:** `frontend/apps/web/src/pages/reader/shared/useReaderController.ts`

- [ ] **Step 1: Read the file**, then add (near the other `searchParams` reads):

```ts
  const sort: 'time' | 'interest' = searchParams.get('sort') === 'interest' ? 'interest' : 'time'

  const setSort = useCallback(
    (next: 'time' | 'interest') => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next === 'interest') p.set('sort', 'interest')
          else p.delete('sort')
          return p
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )
```

- [ ] **Step 2:** add `sort` and `setSort` to the returned object.

- [ ] **Step 3: Typecheck + commit** `feat(reader): sort state in controller`.

---

## Task 4 — Frontend: `按兴趣` toggle + section ordering (TDD)

**Files:**
- Modify: `frontend/apps/web/src/pages/reader/shared/components/PeriodView/index.tsx`, `ReaderCore.tsx`
- Test: `frontend/apps/web/src/__tests__/pages/reader/periodSort.test.ts`

- [ ] **Step 1: Write a failing unit test** for the ordering helper. Create `periodSort.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { orderGroupsByAffinity } from '@/pages/reader/shared/components/PeriodView/orderGroupsByAffinity'

describe('orderGroupsByAffinity', () => {
  const g = (feedId: string) => ({ feedId }) as never
  it('time mode keeps original order', () => {
    const groups = [g('a'), g('b'), g('c')]
    expect(orderGroupsByAffinity(groups, 'time', {}).map((x) => x.feedId)).toEqual(['a', 'b', 'c'])
  })
  it('interest mode sorts by affinity desc, missing = 0, stable on ties', () => {
    const groups = [g('a'), g('b'), g('c')]
    const aff = { a: 1, c: 5 } // b missing -> 0
    expect(orderGroupsByAffinity(groups, 'interest', aff).map((x) => x.feedId)).toEqual(['c', 'a', 'b'])
  })
})
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement the helper** — create `frontend/apps/web/src/pages/reader/shared/components/PeriodView/orderGroupsByAffinity.ts`:

```ts
import type { TodayBoardFeedGroup } from '@/pages/reader/shared/todayBoard'

export function orderGroupsByAffinity(
  groups: TodayBoardFeedGroup[],
  sort: 'time' | 'interest',
  affinity: Record<string, number>
): TodayBoardFeedGroup[] {
  if (sort !== 'interest') return groups
  return groups
    .map((g, i) => ({ g, i }))
    .sort((x, y) => {
      const d = (affinity[y.g.feedId] ?? 0) - (affinity[x.g.feedId] ?? 0)
      return d !== 0 ? d : x.i - y.i // stable tie-break on original order
    })
    .map((x) => x.g)
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Wire into `PeriodView`** — add props `sort: 'time' | 'interest'`, `affinity: Record<string, number>`, `onChangeSort: (s: 'time' | 'interest') => void`. Apply ordering to the rendered groups:

```ts
import { orderGroupsByAffinity } from './orderGroupsByAffinity'
// ...after `const groups = useMemo(...)`:
const orderedGroups = orderGroupsByAffinity(groups, sort, affinity)
```

Render `orderedGroups` instead of `groups` in the `.map(...)`. Add the toggle to the masthead next to the `日/周/月` control:

```tsx
<div className="border-border/60 inline-flex overflow-hidden rounded-md border text-xs">
  {(['time', 'interest'] as const).map((s) => (
    <button key={s} type="button" onClick={() => onChangeSort(s)}
      className={cn('px-2.5 py-1', s === sort ? 'bg-primary/10 text-primary font-medium' : 'text-stone-500')}>
      {s === 'time' ? '时间' : '按兴趣'}
    </button>
  ))}
</div>
```

- [ ] **Step 6: Wire `ReaderCore`** — pull `sort, setSort` from `useReaderController()`; call `const affinityQuery = useSourceAffinity(!!periodKind)`; pass to `<PeriodView>`: `sort={sort} affinity={affinityQuery.data?.affinity ?? {}} onChangeSort={setSort}`. (Import `useSourceAffinity`.)

- [ ] **Step 7: Verify**
- `pnpm --dir frontend run typecheck` → clean.
- `pnpm --dir frontend/apps/web exec vitest run src/__tests__/pages/reader/periodSort.test.ts src/__tests__/pages/reader` → new test passes; no NEW failures beyond the 12 pre-existing.
- `pnpm --dir frontend exec turbo run build --filter=@glean/web` → builds.

- [ ] **Step 8: Commit** `feat(reader): 按兴趣 source-affinity sort toggle`.

---

## Self-Review

- **Spec coverage:** non-destructive optional sort (Task 4 — default `时间`, toggle, section-order only, never hides); driven by read/save/hide engagement (Task 1 formula); within-source order unchanged (Task 4 orders sections only). Embedding-based scoring intentionally replaced by source-affinity (header note).
- **Placeholder scan:** none — every step has concrete code.
- **Type consistency:** `SourceAffinityResponse.affinity: Record<string, number>` consistent across backend schema, types, api-client, hook; `sort: 'time' | 'interest'` consistent across controller, ReaderCore, PeriodView, `orderGroupsByAffinity`.
