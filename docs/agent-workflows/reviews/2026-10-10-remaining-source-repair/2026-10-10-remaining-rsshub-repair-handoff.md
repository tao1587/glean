# Remaining RSSHub failure repair handoff

## Root cause evidence

Directly associated on-NAS error classifications identified two representative podcast failures as upstream episode-detail HTTP 429, and a separate provider failure as a transport reset. The authorized paced route reprobes recovered, confirming intermittency rather than deterministic empty parsing. The podcast's compiled route launched all episode detail requests with `Promise.all`; one failed detail rejected the whole feed. The deployed `ofetch` policy included HTTP 429 among its retryable statuses.

A representative public podcast overview returned 200 both directly and through the configured proxy with production-generated headers and installed Undici. All 15 overview episodes had descriptions and audio enclosures, validating metadata fallback availability. Standalone native fetch without production header/proxy bootstrap was not treated as routing evidence. Private source names, identifiers and payloads remain outside this repository.

## What changed

- Remove only HTTP 429 from the known RSSHub retry status list. Runtime retry count remains a root-owned deployment setting; bounded transport/server retries are preserved.
- Replace only podcast detail enrichment with two workers, ordered output and an invocation-local 429 cooldown. Existing full-detail cache hits remain usable. Limited details use nonempty overview shownotes/description; missing metadata and other errors remain explicit failures.
- Keep successful detail cache behavior; overview fallbacks never replace full detail entries.
- Add fail-closed compiled-module transforms, validating both modules and JavaScript syntax before writing either file. Update the existing dependency Dockerfile to apply both repairs while retaining the Anthropic research adapter.
- Update the contract and operational explanation with generic diagnosed evidence. No worker retries, source policy, proxy routing or user settings changed.

## Files touched

- `scripts/rsshub/podcast-detail-enrichment.mjs` and fixture tests
- `scripts/rsshub/patch-source-reliability.mjs` and executable patcher tests
- `scripts/rsshub/ofetch-retry-policy.test.mjs`
- `scripts/rsshub/Dockerfile`
- `docs/exec-plans/active/2026-10-10-remaining-source-repair-contract.md`
- `docs/operations/rsshub-route-repairs.md`
- This handoff

## Test-first verification

- Enrichment RED: three failures and two preservation passes, demonstrating eight simultaneous requests, whole-feed 429 failure and unusable cache fallback. GREEN: all five cases pass.
- Executable patcher RED: two intended failures, then GREEN for patched route output and unsupported/duplicate layout rejection. An additional CLI case proves an unsupported second module leaves the first module unmodified.
- Real installed `ofetch` loopback RED: 429 issued three requests instead of one; 500 retry preservation already passed. GREEN: all three cases pass — one 429 attempt, three attempts recovering from 500 and two attempts recovering from a socket reset.
- Both transforms validated against the actual deployed public compiled modules in memory; both generated syntax checks returned zero. No production module was written.
- Final local executable/fixture suite: ten tests passed, including the existing Anthropic patcher regressions and the new CLI no-partial-write case. Both new production modules passed `node --check`; repository docs validation and `git diff --check` passed.

## Remaining deployment gates

Root owns immutable dependency image build, canary container, restoring `REQUEST_RETRY=2` with the patched image, live RSS canaries and rollback verification. Actual patched-helper loopback tests and final live route results remain required. The repair does not guarantee availability during provider/account outages. The generator made no NAS production changes, no commits and left all six pre-existing dirty files untouched.
