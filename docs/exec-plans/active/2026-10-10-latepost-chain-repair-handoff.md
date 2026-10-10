# Publisher TLS chain completion handoff

## Proven root cause

A subscribed publisher's HTTPS endpoint served only its website certificate and the Let's Encrypt YR1 intermediate. YR1 chains to Root YR, which is not independently present in the deployed trust set; the server omitted the Root YR certificate cross-signed by the already trusted ISRG Root X1. Both direct and configured-proxy requests failed before HTTP with certificate issuer verification errors. The leaf was within its validity period, so expiry, authentication and parser assumptions were not treated as the cause.

The official bridge's cryptographic signature verified against the existing trusted ISRG Root X1. In-memory chain completion retained hostname and certificate verification and restored HTTP 200, valid JSON for the existing column/news endpoints. Private source inventories remain outside this repository.

## What changed

- Vendor only the [official public cross-signed certificate](https://letsencrypt.org/certs/gen-y/root-yr-by-x1.pem), with [CA provenance](https://letsencrypt.org/certificates/) and pinned DER SHA-256.
- Verify the exact certificate fingerprint, CA property, validity period and issuer signature against an already trusted ISRG Root X1 before loading it.
- Preload the bridge only in the RSSHub process, appending to Node's current default CA list, which includes existing extra CAs. `NODE_EXTRA_CA_CERTS` and its file remain unchanged. No host/system CA store, proxy, headers, caching, hostname verification or certificate checks are changed.
- Preserve `dumb-init --`, the upstream command and existing `NODE_OPTIONS`. Add only the startup preload to Node options.
- Build-time verification rejects an invalid bridge or unsupported Node CA APIs. Optional runtime completion failure emits a fixed diagnostic and leaves the default trust list unchanged, so another provider's unavailable chain cannot stop RSSHub.
- Import the trusted synchronous CA installer first from the compiled common app entrypoint so every app/cluster process initializes trust independently of Node options. No user-supplied import, cluster setting or proxy change is introduced.

## Files touched

- `scripts/rsshub/certs/root-yr-by-x1.pem` and public provenance README
- `scripts/rsshub/public-ca-chain.mjs` and tests
- `scripts/rsshub/install-ca-chain.mjs`
- `scripts/rsshub/with-ca-chain.sh`
- `scripts/rsshub/patch-ca-entrypoint.mjs` and real cluster-fork tests
- `scripts/rsshub/Dockerfile` additions only; the previously approved transport/podcast patch code is unchanged
- This handoff

## Test-first verification

- Initial certificate validation/preload tests produced five intended RED failures. After implementation, those tests passed.
- The optional runtime-failure availability guard produced one intended RED failure, then passed after implementing unchanged-trust fallback with a fixed diagnostic.
- Six final CA tests pass: correct bridge/issuer signature, corrupt and wrong self-signed certificate rejection, missing issuer/expiry rejection, preservation of every prior default CA and extra-CA setting, no mutation after failed validation, and optional runtime continuity.
- Original complete compiled publisher handler ran in an isolated Node process with the verified bridge and installed production proxy/header/cache context: one requested item, one valid date and one nonempty article body. No active numeric-length or null-body failure occurred; no publisher parser patch was added.
- Final combined local RSSHub patch/certificate suite: 16 tests passed. Node preload syntax, shell syntax, build-time certificate verifier, repository docs validation and `git diff --check` passed.
- A derived image inspection caught a startup regression before deployment: adding the wrapper ENTRYPOINT cleared the base image's inherited CMD, leaving `Config.Cmd=null`. The actual-image command-preservation check failed (RED); the candidate was never deployed. The Dockerfile now explicitly sets the verified pinned-base command `CMD ["npm", "run", "start"]`. Root must rebuild and confirm both image configuration and default startup without a command override before acceptance.
- A later default-startup HTTP canary still hit the original issuer error. Public startup-code inspection identified the exact reason: `cross-env NODE_ENV=production NODE_OPTIONS='--max-http-header-size=32768' node dist/index.mjs` discards the wrapper preload before the actual app starts. The compiled `cluster.fork()` itself has no environment override, and dotenv does not reset Node options.
- Real cluster-fork RED: parent/child bridge was absent with Node options cleared. An entry import alone still failed the before-TLS-context check because the installer/verification dependency contained top-level await. Making both synchronous produced GREEN: parent and child had the pinned bridge before proxy-context construction, retained ISRG Root X1, preserved command arguments and kept cleared options unchanged. Unsupported app layouts also reject before writing.
- Final combined local suite: 18 tests passed. The actual candidate compiled `index.mjs` transformation passed syntax validation entirely in memory; no NAS file or service was mutated. New derived-image default-startup and live HTTP evidence remain a root-owned gate.

## Remaining gates

Root owns the derived image build, canary startup, default live publisher RSS checks, rollback identities and deployment. The bridge helps a server complete an existing trusted chain; it does not promise availability during provider outages. The generator did not mutate NAS production services or certificate stores, made no commits and kept the six original dirty files intact.
