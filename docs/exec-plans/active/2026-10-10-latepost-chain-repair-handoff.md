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

## Files touched

- `scripts/rsshub/certs/root-yr-by-x1.pem` and public provenance README
- `scripts/rsshub/public-ca-chain.mjs` and tests
- `scripts/rsshub/install-ca-chain.mjs`
- `scripts/rsshub/with-ca-chain.sh`
- `scripts/rsshub/Dockerfile` additions only; the previously approved transport/podcast patch code is unchanged
- This handoff

## Test-first verification

- Initial certificate validation/preload tests produced five intended RED failures. After implementation, those tests passed.
- The optional runtime-failure availability guard produced one intended RED failure, then passed after implementing unchanged-trust fallback with a fixed diagnostic.
- Six final CA tests pass: correct bridge/issuer signature, corrupt and wrong self-signed certificate rejection, missing issuer/expiry rejection, preservation of every prior default CA and extra-CA setting, no mutation after failed validation, and optional runtime continuity.
- Original complete compiled publisher handler ran in an isolated Node process with the verified bridge and installed production proxy/header/cache context: one requested item, one valid date and one nonempty article body. No active numeric-length or null-body failure occurred; no publisher parser patch was added.
- Final combined local RSSHub patch/certificate suite: 16 tests passed. Node preload syntax, shell syntax, build-time certificate verifier, repository docs validation and `git diff --check` passed.
- A derived image inspection caught a startup regression before deployment: adding the wrapper ENTRYPOINT cleared the base image's inherited CMD, leaving `Config.Cmd=null`. The actual-image command-preservation check failed (RED); the candidate was never deployed. The Dockerfile now explicitly sets the verified pinned-base command `CMD ["npm", "run", "start"]`. Root must rebuild and confirm both image configuration and default startup without a command override before acceptance.

## Remaining gates

Root owns the derived image build, canary startup, default live publisher RSS checks, rollback identities and deployment. The bridge helps a server complete an existing trusted chain; it does not promise availability during provider outages. The generator did not mutate NAS production services or certificate stores, made no commits and kept the six original dirty files intact.
