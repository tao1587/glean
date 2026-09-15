# Prevent Oversized MTranServer JSON Requests

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` must remain current while work proceeds. Maintain
this document in accordance with repository-root `.agents/PLANS.md` and the planner/generator/
evaluator loop in `docs/agent-workflows/default-loop.md`.

## Purpose / Big Picture

Glean currently fails to translate some articles because its MTran provider estimates request size
from Python character counts. MTranServer v4.0.33 accepts at most 102,400 bytes in one request body,
but a Chinese character normally occupies three UTF-8 bytes and JSON syntax may escape quotes,
backslashes, and control characters. The estimate can therefore admit a JSON body such as the
observed 113,923-byte request. The server logs `PayloadTooLargeError: request entity too large`; its
batch route fails and Glean's retry through the single-item route sends the same oversized text and
fails again.

After this change, Glean measures the exact serialized bytes it will transmit. Every MTran request
body is at most 102,400 bytes, normal input is still batched in order, and one exceptionally large
input is split into safe pieces and reconstructed into exactly one translated result. A user can
observe the fix by translating an article containing a block larger than 100 KiB without the
MTranServer payload-limit error.

## Progress

- [x] (2026-09-15 06:59Z) Read repository and backend `AGENTS.md`, `.agents/PLANS.md`, all documents
  under `docs/agent-workflows/`, the MTran provider, its unit tests, and the translation worker call
  site.
- [x] (2026-09-15 06:59Z) Confirm the failure mechanism and define the implementation and test
  contract.
- [x] (2026-09-15 07:18Z) Generator implemented exact MTran request serialization, byte- and
  count-bounded batch packing, safe oversized-single splitting/reassembly, and the specified unit
  tests.
- [x] (2026-09-15 07:18Z) Generator ran focused pytest, targeted Ruff check/format, targeted
  Pyright, and `git diff --check`, then recorded the exact outcomes and handoff below.
- [x] (2026-09-15 07:24Z) Evaluator independently checked the implementation and rejected this
  iteration because the oversized `translate_batch` path resolves `source="auto"` three times for
  the same complete input instead of once; all other exercised contract behaviors passed.
- [x] (2026-09-15 07:30Z) Generator corrected the rejected path by retaining the exact one-item
  payload's resolved language codes, avoiding its duplicate precheck, and calling a private
  resolved-source translation helper. A regression test now requires exactly one detector call with
  the complete oversized input and the same returned source code on every piece.
- [x] (2026-09-15 07:30Z) Generator re-ran focused pytest, targeted Ruff check/format, targeted
  Pyright, and `git diff --check`; all completed successfully, with Pyright's existing warnings
  unchanged. Independent re-evaluation remains pending.
- [x] (2026-09-15 07:33Z) Evaluator re-evaluated the correction and rejected the second iteration:
  an oversized item following only empty or whitespace-only pending items is still auto-detected
  twice from the complete original string. The isolated `[huge_text]` case is corrected.
- [x] (2026-09-15 07:36Z) Generator corrected both empty-prefix compositions by reusing the failed
  candidate's resolved language codes when its pending prefix contains no non-empty text, rebuilding
  only the one-item `texts` field, and checking its exact encoded size without redetection.
- [x] (2026-09-15 07:36Z) Parameterized regression coverage for `""` and `" \t\n"` prefixes passed
  with exact one-call source detection, lossless ordered results, and piece-stable source codes.
  Focused pytest, targeted Ruff check/format, targeted Pyright, and `git diff --check` all completed
  successfully. A third independent evaluation remains pending.
- [x] (2026-09-15 07:39Z) Evaluator independently verified all four oversized auto-detection
  compositions, re-ran focused tests and static checks, and accepted the sprint against every rubric
  category and completion criterion.

## Surprises & Discoveries

- Observation: `MTRAN_MAX_PAYLOAD_SIZE` already equals the server limit, but
  `MTranProvider.translate_batch` uses `int(len(text) * 1.1) + 10` plus a guessed 100-byte envelope.
  Evidence: `backend/packages/core/glean_core/services/translation_providers.py`, in
  `translate_batch`.
- Observation: the size check only runs when `current_batch` is non-empty. The first input is always
  appended even if it cannot fit, and the defensive `if not current_batch` branch cannot repair that
  case. Evidence: the same method appends at least one item before calling
  `_translate_batch_chunk`.
- Observation: `_translate_batch_chunk` recognizes HTTP 413, but the observed MTranServer log calls
  the parser exception "Unhandled Error" and the failing batch may surface as HTTP 500. A response
  status check is therefore not a reliable primary size control. Preflight byte accounting is
  required.
- Observation: the current checkout is `/Users/aro/Sites/github/glean` on `personal-main` and its
  configured `origin` and `upstream` remotes are GitHub URLs. This checkout does not by itself prove
  that the NAS deployment is built from a local GitLab mirror.
- Observation: the working tree contains extensive unrelated changes, including user changes to
  `docs/exec-plans/active/index.md`. The two proposed implementation files are currently clean, so
  the sprint can avoid all unrelated work.
- Observation: the first focused pytest command did not reach test collection because `uv` could not
  open its default cache (`/Users/aro/.cache/uv/sdists-v9/.git: Operation not permitted`). Retrying
  with `UV_CACHE_DIR=/tmp/glean-mtran-uv-cache` found the repository `.venv` linked to a missing
  interpreter and then failed to remove `.venv/lib` with `Directory not empty (os error 66)`.
  Evidence: exact command outputs observed during the generator baseline run on 2026-09-15.
- Observation: an isolated project environment at `/tmp/glean-mtran-venv` allowed the focused test
  and lint commands to run without modifying the broken repository `.venv`. The installed Pyright
  initially crashed under the system Node.js v12.13.0 with `SyntaxError: Unexpected token '?'`;
  placing the ChatGPT-bundled modern Node.js first on `PATH` allowed the same targeted check to
  complete with zero errors. Evidence: generator verification commands on 2026-09-15.
- Observation: the first implementation kept language codes consistent on transmitted pieces but
  still invoked `_detect_client_side` three times for `translate_batch([huge_text], "auto", target)`:
  candidate sizing, duplicate one-item sizing, and public `translate`. Evidence: the evaluator's
  instrumented probe and rejected assessment at 07:24Z. Reusing the first one-item payload removes
  both later resolutions while preserving its exact byte-fit result.
- Observation: a failed multi-item candidate can already resolve its oversized member when every
  pending predecessor is empty or whitespace-only. Flushing those predecessors does not invalidate
  that source/target resolution; only the `texts` field and encoded size differ for the one-item
  decision. Evidence: the second evaluator probe observed two calls for both `""` and `" \t\n"`
  prefixes before this correction and one call after the generator change.

## Decision Log

- Decision: fix the Glean client instead of raising the MTranServer body limit. Rationale: an exact
  client-side bound works with the deployed v4.0.33 service, avoids maintaining a forked server
  image, and prevents predictable failed requests. Date/Author: 2026-09-15 / Planner.
- Decision: serialize each MTran payload once with an owned compact JSON encoder and send those exact
  bytes through `httpx`'s `content=` argument. Rationale: measuring one serializer while allowing
  another serializer to transmit the body would reintroduce drift. Date/Author: 2026-09-15 /
  Planner.
- Decision: use UTF-8 JSON with `ensure_ascii=False`, compact separators, and `allow_nan=False`.
  Rationale: the byte count includes real UTF-8 width and all required JSON escapes without
  needlessly expanding CJK into `\uXXXX` sequences. Date/Author: 2026-09-15 / Planner.
- Decision: a single input that cannot fit in a one-item batch is translated through the single
  route; if it cannot fit there either, split it into bounded pieces and concatenate the translated
  pieces. Rationale: this preserves one output per input and prevents the current batch-to-single
  retry loop from repeating the same invalid request. Date/Author: 2026-09-15 / Planner.
- Decision: resolve automatic source-language detection once from the original oversized input and
  reuse that code for every piece. Rationale: chunk boundaries must not cause different pieces of
  one source string to be translated under inconsistent language settings. Date/Author: 2026-09-15
  / Planner.
- Decision: when a one-item batch candidate is oversized, retain both that candidate's fit result
  and its already resolved `from`/`to` codes, then pass the codes to `_translate_resolved` instead of
  calling public `translate`. Rationale: this satisfies the literal one-resolution invariant and
  avoids reserializing the identical candidate while keeping public signatures unchanged.
  Date/Author: 2026-09-15 / Generator, evaluator correction.
- Decision: after flushing pending items, reuse the failed candidate's resolved language codes only
  when the pending list has no non-empty text and the candidate payload exists; otherwise resolve
  the current item independently. Rationale: under the existing first-non-empty rule, only an
  all-empty pending prefix guarantees that the candidate's source resolution came from the current
  item. Date/Author: 2026-09-15 / Generator, second evaluator correction.

## Sprint Contract

### Scope and files

The generator may modify only these implementation files:

- `backend/packages/core/glean_core/services/translation_providers.py`
- `backend/packages/core/tests/test_translation_providers.py`

This contract file may be updated only to keep its required living sections and handoff evidence
current. Do not edit `docs/exec-plans/active/index.md`; it already contains user work. Do not modify,
format, stage, restore, or delete any unrelated dirty file.

### Required behavior

For MTran only, the completed implementation must satisfy all of the following:

1. `translate_batch([])` continues to return `[]`. For non-empty input, returned results have the
   same count and order as the original input list.
2. No request to `/translate/batch` or `/translate` has an entity body longer than
   `MTRAN_MAX_PAYLOAD_SIZE`, currently 102,400 bytes. The assertion concerns the exact bytes passed
   to `httpx`, not a character estimate or a separately reconstructed payload.
3. A normal batch contains at most `MTRAN_BATCH_SIZE`, currently 24 items. It is also cut earlier
   whenever adding the next item would make the exact encoded batch body exceed the byte limit.
4. CJK text, emoji and other multibyte Unicode, and JSON-sensitive input containing quotes,
   backslashes, tabs, carriage returns, or newlines are counted correctly after serialization.
5. If one input cannot fit in a one-item batch, Glean must never send that oversized batch. Route the
   input through the safe single-text path. If its single-route body is also too large, split it into
   safe pieces, translate every piece, concatenate their translations in source order, and place the
   reconstructed string in the one result slot belonging to the original input.
6. Splitting must make forward progress and must not truncate, duplicate, reorder, or normalize any
   source character before translation. Prefer a recent newline, sentence punctuation, semicolon,
   or whitespace boundary when one occurs in the latter half of the largest fitting prefix;
   otherwise cut at the largest fitting Python string index. Keep the chosen delimiter in one of the
   adjacent pieces. Concatenate translated pieces with the empty string so the provider does not
   invent a separator that was absent from the source.
7. Resolve `source="auto"` once against the complete original oversized string and reuse the resolved
   source code for all of its single-route pieces. Preserve the existing first-non-empty-item source
   detection behavior for ordinary batch chunks and preserve target-language normalization.
8. Do not silently truncate input. If even one source character plus the fixed JSON envelope cannot
   fit, raise a clear local `ValueError` before making a request. This is a defensive invariant; with
   a 102,400-byte limit, valid Unicode scalar values will fit.
9. Existing response parsing, authorization headers, timeouts, "No model found" fast-failure, and
   batch-error fallback semantics remain intact. After the change, batch fallback may call
   `translate` safely because that method itself handles oversized single inputs.

### Non-goals

This sprint does not change the MTranServer container, its 102,400-byte parser limit, Docker or
Compose files, reverse-proxy limits, language-detection heuristics, worker HTML segmentation,
database/API schemas, provider settings, retries, timeouts, logging policy, or Google/DeepL/OpenAI
providers. It does not prove or change where the NAS obtains its Glean source; deployment-source
verification is a separate operational investigation.

## Context and Orientation

`backend/apps/worker/glean_worker/tasks/translation.py` collects the visible text of article block
elements and calls `provider.translate_batch(all_texts, source, target)`. The MTran implementation is
`MTranProvider` in
`backend/packages/core/glean_core/services/translation_providers.py`. Its `translate` method posts a
dictionary with keys `text`, `from`, and `to` to `/translate`. Its `translate_batch` method groups
strings, and `_translate_batch_chunk` posts keys `texts`, `from`, and `to` to `/translate/batch`.
`backend/packages/core/tests/test_translation_providers.py` replaces `httpx.Client` with small fake
clients and already checks route selection, language codes, response parsing, and the 24-item count
limit.

An HTTP entity body is the JSON byte sequence carried by the request. Python `len(text)` counts code
points rather than encoded bytes, so it cannot enforce the MTranServer limit. JSON also transforms
some source characters: for example, a newline becomes the two bytes `\n`, and a quote or backslash
is prefixed with a backslash. The implementation must therefore bound the final JSON bytes.

## Plan of Work

In `translation_providers.py`, add a small serializer such as `_encode_mtran_payload(payload) ->
bytes`. It must call `json.dumps(payload, ensure_ascii=False, separators=(",", ":"),
allow_nan=False).encode("utf-8")`. Centralize MTran posting in a helper that accepts a payload,
encodes it with that function, verifies the resulting length is within the constant, and passes the
same bytes to `httpx.Client.post(..., content=encoded, headers=self._headers())`. Do not pass `json=`
on these calls because that would ask `httpx` to serialize the payload again.

Factor construction of single and batch payload dictionaries so the batch packer, splitter, and
request method all use the same field values and language-code logic. Exact batch packing should try
the full candidate list on each addition. Serializing at most 24 short candidate lists is cheap and
avoids error-prone incremental overhead arithmetic.

Replace the approximate batching loop with this order-preserving algorithm:

1. Consider the next input appended to the pending batch.
2. If item count is at most 24 and the exact candidate body fits, retain the candidate and continue.
3. Otherwise, flush the pending batch if it is non-empty.
4. Re-evaluate the next input as a one-item batch. If it fits, begin a new pending batch with it. If
   it does not fit, call the safe `translate` path for that input immediately and append its one
   reconstructed result.
5. Flush the final pending batch at end of input.

Refactor `translate` so a private single-request primitive can send one already-resolved source code
without recursively re-running language detection. `translate` resolves source and target codes,
checks the exact single payload, and either invokes the primitive once or calls an oversized-text
splitter and invokes the primitive for every returned piece.

Implement the splitter by repeatedly binary-searching for the largest non-empty prefix whose exact
single-route body fits. Encoding size is monotonic as source characters are appended. After finding
that prefix, scan backward within its latter half for the last preferred boundary from this set:
newline, `.`, `!`, `?`, `。`, `！`, `？`, `;`, `；`, or whitespace. Cut immediately after the
boundary. If none exists, retain the binary-search cut. Advance by the exact cut index, keeping every
character. This produces bounded pieces without quadratic trial-by-character behavior.

In `test_translation_providers.py`, update or replace the fake client so it records `content` bytes,
decodes them with UTF-8, and loads the JSON for semantic assertions. Make the echo fake return each
received source string unchanged (or with a deterministic per-piece transformation that can be
reassembled) so tests can prove order and lossless source partitioning.

## Milestones

### Milestone 1: Exact request bytes and normal batch packing

At the end of this milestone, ordinary MTran requests use the shared serializer and every normal
batch is limited by both 24 items and 102,400 transmitted bytes. Existing provider tests still pass
after adapting their fake client. Add focused tests with repeated Chinese characters and repeated
JSON escape characters that would defeat the old `len(text) * 1.1` estimate. The tests must inspect
the captured byte bodies and assert `len(body) <= MTRAN_MAX_PAYLOAD_SIZE` for every call, while also
asserting that decoding each body recovers the original strings in order.

### Milestone 2: Oversized single-item handling and regression validation

At the end of this milestone, both `translate(huge_text, ...)` and
`translate_batch([huge_text], ...)` succeed through multiple bounded `/translate` requests and
return one reconstructed translation. Add a mixed list test such as `[small_before, huge,
small_after]` to prove output cardinality and ordering across a pending-batch flush and the direct
oversized path. Run the focused test and lint/type checks, then hand the sprint to an independent
evaluator.

## Concrete Steps

Work from `/Users/aro/Sites/github/glean`. Before editing, verify that only the two scoped
implementation files will be touched:

    git status --short -- \
      backend/packages/core/glean_core/services/translation_providers.py \
      backend/packages/core/tests/test_translation_providers.py \
      docs/exec-plans/active

Write the new tests first and run the focused file to demonstrate that the old estimator fails the
new byte-bound assertions:

    cd /Users/aro/Sites/github/glean/backend
    uv run pytest packages/core/tests/test_translation_providers.py -q

Implement the shared serializer, exact packer, and safe single-item splitting. Re-run:

    cd /Users/aro/Sites/github/glean/backend
    uv run pytest packages/core/tests/test_translation_providers.py -q
    uv run ruff check packages/core/glean_core/services/translation_providers.py \
      packages/core/tests/test_translation_providers.py
    uv run ruff format --check packages/core/glean_core/services/translation_providers.py \
      packages/core/tests/test_translation_providers.py
    uv run pyright packages/core/glean_core/services/translation_providers.py \
      packages/core/tests/test_translation_providers.py

If `uv` cannot obtain dependencies in the local environment, record the exact failed command and
error. Do not claim that a check passed unless its output was observed. Do not broaden formatting or
lint commands to unrelated dirty files.

## Validation and Acceptance

The generator must add or equivalently cover these test cases:

- `test_mtran_batch_limits_exact_utf8_json_bytes`: several CJK/emoji-heavy items are split across
  batch requests; every captured body is at most 102,400 bytes; decoded inputs and returned outputs
  preserve order.
- `test_mtran_batch_counts_json_escaping_bytes`: quotes, backslashes, newlines, tabs, and carriage
  returns cannot produce an oversized captured body and survive JSON decode unchanged.
- `test_mtran_translate_splits_oversized_single_text`: direct translation of one body larger than the
  limit creates multiple safe `/translate` calls and reconstructs one result without source loss.
- `test_mtran_batch_splits_oversized_single_item`: a list containing one huge item never posts an
  oversized `/translate/batch` body and returns exactly one result.
- `test_mtran_batch_preserves_order_around_oversized_item`: small/huge/small input returns three
  results in that order while all request bodies remain within the limit.
- Existing tests for standard payload fields, automatic language selection, CJK behavior, 24+6
  chunking, response parsing, default URL, and provider creation continue to pass.

The sprint is complete only when all the following are true:

1. The focused pytest file passes.
2. Targeted Ruff checking and formatting pass.
3. Targeted Pyright passes, or a repository/tooling limitation is recorded with exact output and the
   evaluator independently inspects the annotations.
4. Unit tests inspect actual transmitted `content` bytes and prove that all MTran bodies are at or
   below 102,400 bytes for ASCII, multibyte Unicode, JSON escapes, and a single oversized input.
5. No source text is silently truncated and output count/order remains stable.
6. `git diff --name-only` for this sprint contains only the two implementation/test files and this
   contract or explicitly identifies pre-existing unrelated user changes without modifying them.
7. The evaluator accepts contract compliance, behavioral correctness, regression risk, repository
   fit, and verification quality under `docs/agent-workflows/evaluator-rubric.md`.

## Idempotence and Recovery

The work changes no database state or deployment. Tests and lint commands are safe to repeat. If an
implementation attempt fails, edit only the two scoped files; never use `git reset`, `git checkout`,
or bulk formatting in this dirty worktree. Preserve the pre-existing working tree exactly. Reverting
this sprint consists only of reverting the scoped provider/test diff after first confirming ownership
of those changes.

## Risks

Splitting a very large paragraph can reduce translation quality because each piece has less context.
Preferred semantic boundaries limit that cost, and this is better than a guaranteed failed request.
Concatenating translated pieces without adding a separator avoids fabricating punctuation or spaces;
the source delimiter is retained inside one piece, although MTranServer may normalize it in its
translation. Exact preflight protects the known v4.0.33 limit but cannot guarantee success if an
operator later configures a lower upstream proxy limit. Non-size HTTP failures continue through the
existing fallback behavior.

## Interfaces and Dependencies

No new package is allowed. Use the existing standard-library `json` module and `httpx`. The final
provider should have equivalent internal interfaces to the following; exact private names may differ
if their responsibilities and tests remain clear:

    def _encode_mtran_payload(payload: dict[str, Any]) -> bytes: ...

    class MTranProvider(TranslationProvider):
        def _single_payload(
            self, text: str, resolved_source: str, resolved_target: str
        ) -> dict[str, Any]: ...

        def _batch_payload(
            self, texts: list[str], source: str, target: str
        ) -> dict[str, Any]: ...

        def _post_payload(
            self, client: httpx.Client, path: str, payload: dict[str, Any]
        ) -> httpx.Response: ...

        def _split_oversized_text(
            self, text: str, resolved_source: str, resolved_target: str
        ) -> list[str]: ...

Public signatures of `TranslationProvider`, `MTranProvider.translate`,
`MTranProvider.translate_batch`, and `create_translation_provider` must not change.

## Outcomes & Retrospective

Generator implementation and both requested evaluator corrections are complete, and the third
independent evaluation accepted the sprint. MTran now compacts each single or batch payload with the
owned UTF-8 JSON encoder, rejects an oversized encoded body before posting, and supplies those same
bytes through `httpx`'s `content=` argument. Normal batches
retain input order while obeying both the 24-item cap and the 102,400-byte cap. An item too large for
the batch route uses the single route; a single body that is still too large is losslessly divided at
the largest fitting prefix, with a recent semantic boundary preferred, translated under one source
language resolved from the complete original text, and reassembled without adding a separator.

The focused test file passed all 24 tests. Its echo client decodes the actual transmitted bytes and
proves bounded bodies and lossless ordering for ASCII, CJK, emoji, JSON quotes, backslashes, tabs,
carriage returns, newlines, oversized direct input, oversized batch input, and small/huge/small mixed
input. A defensive test also reduces the limit to one byte and confirms a clear local `ValueError`
with no request when even one source character cannot fit. Targeted Ruff check and format checks
passed. Targeted Pyright completed with zero errors and 28 warnings in pre-existing dynamic or
third-party typing areas. No live MTranServer request or NAS deployment was exercised, and the NAS
source-mirror question remains explicitly outside this sprint.

After the first evaluator rejection, the oversized batch regression additionally instruments source
detection. It observes exactly one call whose argument equals the complete original text, then
asserts every transmitted single-route piece uses the detector's returned source code. The pending
batch algorithm now reuses the candidate payload and its failed fit result when the candidate is
already the one-item batch, rather than rebuilding it, and passes its resolved language codes to a
private helper that performs fitting, splitting, requests, and reconstruction without detection.

After the second rejection, parameterized regression cases now prepend either an empty string or a
whitespace-only string to the oversized input. Both preserve two-result cardinality and exact order,
call detection exactly once with the complete huge string, reconstruct the huge result losslessly,
and use the returned source code on every single-route piece. The implementation reuses candidate
language codes only when every flushed pending item is empty after stripping; a non-empty pending
item still requires independent resolution of the current item.

The implementation confirms the central lesson from the incident: Python character count is not a
safe proxy for an HTTP entity body. Only serializing with the exact encoder used for transmission and
checking those bytes covers both multibyte Unicode and JSON escaping.

### Evaluator Assessment (2026-09-15)

Verdict: **REJECT**.

Contract compliance fails required behavior 7. For `translate_batch([huge_text], "auto", target)`,
the candidate fit check at `translation_providers.py:616-618` builds a batch payload and detects the
source, the one-item recheck at lines 626-627 detects it again, and the call through `translate` at
line 630 reaches lines 586-592 and detects it a third time before splitting. An independent probe
instrumented `_detect_client_side` and observed `oversized_batch_detection_calls: 3`; the equivalent
direct `translate` probe observed one call. Every transmitted piece still used `from: "en"` in the
probe, so this does not currently corrupt output, but it violates the explicit requirement to resolve
automatic source language once against the complete oversized input and reuse that resolution for
all pieces. The focused tests do not count detector calls in the oversized batch cases, leaving this
contract behavior unprotected.

The next generator iteration should retain the resolved source code from the one-item oversized
decision and pass it into a private resolved-source translation/splitting path, avoiding another call
to public `translate`. It should also avoid serializing and detecting the identical one-item batch
candidate twice when `pending` is empty. Add a regression test that instruments source detection for
`translate_batch([huge_text], "auto", target)`, asserts exactly one call with the complete original
string, and asserts that every single-route piece carries the returned source code.

The other rubric checks passed on independent inspection and execution. The exact compact UTF-8 JSON
bytes checked by `_post_payload` are the same bytes supplied to `httpx` through `content=`; batch
packing respects both 24 items and 102,400 bytes; splitting makes one-character progress, preserves
preferred delimiters and every source character, and concatenates translations without an invented
separator; empty input, target normalization, response parsing, batch fallback, `No model found`
fast-failure, authorization headers, and client timeouts remain intact. The focused suite reported
`22 passed, 1 warning`; targeted Ruff check and format check passed; targeted Pyright reported zero
errors and 28 warnings; and `git diff --check` passed for the two Python files. The dirty active-plan
index and other untracked plans remain unrelated pre-existing work.

### Evaluator Re-assessment (2026-09-15)

Verdict: **REJECT**.

The second iteration fixes the exact test case `translate_batch([huge_text], "auto", target)`: an
independent detector-count probe observed one call with the complete 168,000-character source, and
all single-route pieces reused its returned source plus normalized target `zh-Hans`. It does not fix
the same required behavior when the pending batch contains only empty or whitespace-only strings.
For `translate_batch(["", huge_text], "auto", target)` and
`translate_batch([" \t\n", huge_text], "auto", target)`, the probe observed two detector calls,
both with the complete 168,000-character oversized source. The first occurs while building the
failed multi-item candidate at lines 624-626, because the huge text is the candidate's first
non-empty item. After lines 631-633 flush the empty-only pending batch, line 634 rebuilds a one-item
payload and detects the same source again. All transmitted pieces consequently reuse only the
second result. A deliberately distinct result per detector call made this visible as
`single_from: ["detected-2"]`.

This remains a failure of required behavior 7, and the contract separately requires empty strings
to preserve count and order, so empty-prefix composition cannot be excluded. The regression at
`test_translation_providers.py:415-444` covers only `[text]` and therefore passes while the composed
edge case remains unprotected. The next iteration should add tests for empty and whitespace-only
prefixes before the oversized item. When the pending list has no non-empty item, the one-item payload
can reuse the already resolved `from` and `to` values from the failed candidate while replacing only
its `texts` list, followed by an exact byte-fit check; when pending has a non-empty item, the current
one-item resolution is still necessary.

Independent re-verification otherwise passed: the focused suite reported `22 passed, 1 warning in
0.71s`, targeted Ruff check and format check passed, targeted Pyright reported zero errors and 28
warnings, and `git diff --check` passed. The probe also reconfirmed lossless output, normalized and
piece-stable target language, and a maximum transmitted body of exactly 102,400 bytes in all four
examined prefix variants.

### Final Evaluator Assessment (2026-09-15)

Verdict: **ACCEPT**.

The third implementation satisfies the full sprint contract. Independent probes exercised
`[huge_text]`, `["", huge_text]`, `[" \t\n", huge_text]`, and `["small", huge_text]` with a
detector that returned a distinct marker for every call. In every composition the 168,000-character
oversized input appeared in the detector arguments exactly once. Every single-route piece used the
marker returned by that one call and normalized target `zh-Hans`; concatenating the source fields of
the pieces reconstructed the original text exactly. Returned result cardinality was one for the
single-item case and two for each prefixed case, with values and order unchanged. The non-empty
prefix case invoked detection separately for the ordinary pending text, as expected, while detecting
the oversized item only once.

The same probes inspected the actual `content` bytes supplied to the fake `httpx` client. Every body
was at or below 102,400 bytes, and each composition produced a maximum body of exactly 102,400 bytes.
Code inspection confirms `_post_payload` encodes once, checks that byte string, and passes the same
object through `content=` with the existing JSON content type and authorization headers. Candidate
packing remains ordered and bounded by both exact encoded size and 24 items. The splitter's binary
search advances by at least one Python character, retains preferred delimiters in a piece, never
normalizes source text, and joins translations with the empty string. Empty input and empty string
results, target normalization, response parsing, timeouts, batch fallback, and `No model found`
fast-failure remain intact.

Verification quality and repository fit are sufficient. The independently run focused suite
reported `24 passed, 1 warning in 1.04s`; targeted Ruff checking reported `All checks passed!` and
format checking reported both files already formatted; targeted Pyright reported zero errors and 28
existing dynamic-typing warnings; and targeted `git diff --check` produced no output. The tests
capture raw transmitted bytes and cover multibyte Unicode, JSON escaping, oversized direct and batch
paths, count/order around an oversized item, impossible one-character envelopes, and the corrected
empty-prefix detection cases. Only the two scoped Python files and this living contract belong to
the sprint; the dirty active-plan index and other untracked plans remain identified pre-existing
work. No live MTranServer or NAS deployment was exercised, but that is a recorded integration gap
and not required by this client-side unit contract.

## Implementation Handoff

### What Changed

- Added compact UTF-8 JSON serialization and a single guarded MTran posting path that transmits the
  exact measured bytes.
- Replaced approximate batch sizing with exact candidate encoding, a 24-item cap, ordered flushing,
  and safe routing of a too-large item through a private helper using the one-item decision's
  already resolved language codes.
- Added binary-search splitting for oversized single input, preferred-boundary cuts, one-time source
  resolution for all pieces, empty-string reassembly, and a no-progress `ValueError` invariant.
- Updated MTran fakes and assertions to inspect raw `content` bytes, plus the five named regression
  scenarios, empty-batch behavior, the impossible-envelope invariant, and exact one-call source
  detection for an oversized batch item with no prefix, an empty prefix, or a whitespace-only
  prefix.

### Files Touched

- `backend/packages/core/glean_core/services/translation_providers.py`
- `backend/packages/core/tests/test_translation_providers.py`
- `docs/exec-plans/active/2026-09-14-mtran-json-payload-limit-sprint-contract.md` (living sections
  and handoff only)

### Verification Run

- After the second evaluator correction, from `backend`, `UV_CACHE_DIR=/tmp/glean-mtran-uv-cache
  UV_PROJECT_ENVIRONMENT=/tmp/glean-mtran-venv uv run --frozen --all-packages pytest
  packages/core/tests/test_translation_providers.py -q --no-cov` collected 24 tests and reported
  `24 passed, 1 warning in 1.14s`.
- After that correction, targeted `ruff check` reported `All checks passed!`, targeted `ruff format
  --check` reported `2 files already formatted`, targeted Pyright reported `0 errors, 28 warnings, 0
  informations`, and targeted `git diff --check` produced no output.
- After the evaluator correction, from `backend`, `UV_CACHE_DIR=/tmp/glean-mtran-uv-cache
  UV_PROJECT_ENVIRONMENT=/tmp/glean-mtran-venv uv run --frozen --all-packages pytest
  packages/core/tests/test_translation_providers.py -q --no-cov` collected 22 tests and reported
  `22 passed, 1 warning in 0.62s`.
- After the correction, targeted `ruff check` reported `All checks passed!`, targeted `ruff format
  --check` reported `2 files already formatted`, targeted Pyright reported `0 errors, 28 warnings, 0
  informations`, and targeted `git diff --check` produced no output.
- From `backend`, `UV_CACHE_DIR=/tmp/glean-mtran-uv-cache
  UV_PROJECT_ENVIRONMENT=/tmp/glean-mtran-venv uv run --frozen --all-packages pytest
  packages/core/tests/test_translation_providers.py -q` collected 22 tests and reported `22 passed,
  1 warning in 18.16s`.
- The same isolated-environment prefix with `ruff check` on the two scoped Python files reported
  `All checks passed!`.
- The same prefix with `ruff format --check` on the two scoped Python files reported `2 files already
  formatted`.
- With `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin` first on `PATH`, the same prefix
  with targeted `pyright` on the two files reported `0 errors, 28 warnings, 0 informations`.
- From the repository root, `git diff --check --` on the two scoped Python files produced no output.
  `git diff --name-only --` for those paths listed only those two files. The active contract remains
  untracked, while the dirty active-plan index and three other untracked plans were pre-existing and
  were not modified by the generator.

### Known Gaps

- No live MTranServer integration request was made; the unit fakes validate exact client-side bytes,
  routes, response parsing, and reconstruction.
- The local repository `.venv` remains broken and was not modified. Verification used an isolated
  `/tmp` environment.
- Third independent evaluator review and the separate NAS deployment-source investigation are
  pending.

### Reviewer Focus

- Confirm every `_post_payload` call sends the same byte string whose length is checked.
- Inspect the pending-batch flush around an oversized item and batch-error fallback cardinality.
- Inspect the binary-search forward-progress proof, preferred cut boundary, complete source
  preservation, and reuse of the resolved source code across all pieces.
- Re-run the detector-count regression or an independent probe to confirm the oversized one-item
  candidate is detected and byte-checked once, then translated without another resolution.
- Exercise both empty and whitespace-only pending prefixes and confirm the candidate resolution is
  reused only for those prefixes, while output count and order remain unchanged.

Revision note (2026-09-15): Created the initial self-contained sprint contract after inspecting the
provider, tests, worker call site, repository workflow rules, and the observed MTranServer v4.0.33
payload-limit failure. The plan intentionally excludes the dirty active-plan index and NAS source-
mirror verification.

Revision note (2026-09-15): Recorded the completed generator implementation, exact verification
evidence, environment/tooling discoveries, remaining gaps, and evaluator handoff.

Revision note (2026-09-15): Recorded the evaluator rejection, the resolved-source helper correction,
the exact one-call detector regression, successful re-verification, and second-iteration handoff.

Revision note (2026-09-15): Recorded the second evaluator rejection, all-empty-pending reuse rule,
two prefix regressions, successful 24-test verification, and third-iteration handoff.
