# Worker build interpreter pin handoff

## Reproduced packaging failure

The first native image build from selector commit `3565debde87c973a9861f80dfd03eadf928df771` failed before an image was produced. Fresh uv 0.13.0 selected Python 3.15.0 under the project's minimum-only Python requirement; locked hiredis 3.3.0 attempted the removed `SourceFileLoader.load_module` API. The deployed worker independently reports Python 3.14.6. No failed image was started or deployed.

## Minimal correction and real GREEN evidence

`backend/Dockerfile.worker` adds only `ARG PYTHON_VERSION=3.14.6` and `ENV UV_PYTHON=${PYTHON_VERSION}`. The API/RSS Dockerfiles, source manifests, tracked lockfile and worker entrypoint are unchanged. [uv's environment reference](https://docs.astral.sh/uv/reference/environment/#uv_python) documents interpreter selection, and its [version-request documentation](https://docs.astral.sh/uv/concepts/python-versions/) supports a full patch-version request.

A draft native build used the frozen selector source plus exactly this Dockerfile delta, with a clear candidate revision label rather than pretending the uncommitted packaging delta was a full Git revision. The build succeeds; candidate image SHA-256 is `b6a59c6162af05b59fa8f29c3e8b0160e4aef21316b4f3f2faa7fb8091a2c4b7`.

The isolated candidate uses the existing non-exported environment and database network. Its script performs SELECT-only checks and intercepts the final `run_worker` call when exercising the actual startup wrapper, so it never consumes Redis jobs or calls providers. Python 3.14.6, imports, installed selector hash `70e607ec1f8f15356da4f548329c48c9f0d8d8edcaa0882cc01c63de1db6a73c` and the no-sync startup-wrapper path pass. An earlier `--help` startup probe was invalid for the wrapper's settings-path argument; this was a diagnostic-method mistake, corrected without changing application code.

Readonly production-data selection returns 211 currently due subscribed feeds, and 222 subscribed feeds in the future supplemental checkpoint; all 46 active feeds owned only by inactive accounts remain eligible. None of the 387 active zero-subscriber catalog feeds is selected. Existing row IDs remain present during the probe: 610 feeds, 182,372 entries, 255 subscriptions, 9,647 read-state rows, 34 bookmarks and two users. Exact identifiers remain in restricted on-NAS evidence.

## Dependency provenance

All 94 installed Python distributions and every locked package version match the current live worker. The tracked/source lock remains SHA-256 `069a093b7798c242471696555f17c211b0169949272f13b4cafbf345dfb2a400`. The generated image lock is SHA-256 `e48c5a423cf8eb3f9f7adbd20b55735dc123bd15c6992c21f3426882bbd242d5`: uv 0.13.0 normalizes format revision 3 to 5 and the Dockerfile's default PyPI build index replaces the preceding USTC mirror URLs. This is not merely a formatting claim. All 146 package records retain identical artifact hashes/sizes and dependency edges, with no locked or installed version changes. Runtime environment preservation is separately verified. No byte equality or dependency upgrade is claimed.

## Final release acceptance

Final source revision `854034857d444096c60592dee0dd7c1e1415330d` builds successfully as image `8e981bc4dac8d7a7b3202613f4184f330bc71cb5c054c19563d7261f412b708e`. Its exact-revision readonly canary repeats source/interpreter/selection and no-consumption wrapper checks successfully. Root then deployed only the worker at 22:37:47 UTC, preserving protected rollback, other services and environment fields except version/interpreter. Actual worker startup and postdeployment selector/heartbeat/data checks pass; the deployment handoff records those separately from the draft. The [independent final assessment](./2026-10-10-latest-nas-log-audit-evaluation.md) is ACCEPTED. The owned draft image and temporary private environment clone have been removed; formal release and rollback evidence remain retained.
