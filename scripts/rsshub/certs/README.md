# Public certificate bridge

`root-yr-by-x1.pem` is the official ISRG Root YR certificate cross-signed by the already trusted ISRG Root X1. It completes the Let's Encrypt `website → YR1 → Root YR → ISRG Root X1` chain when a publisher omits the cross-signed bridge. This file contains only a public CA certificate.

- Source: [official PEM](https://letsencrypt.org/certs/gen-y/root-yr-by-x1.pem)
- Provenance and default chain: [Let's Encrypt certificates](https://letsencrypt.org/certificates/)
- DER SHA-256: `072639d0b140d5bffae16ad9c3f6cc6086040621f51ee61a6d46a8915c07cf76`
- Verification: `public-ca-chain.mjs` checks the pin, CA property, validity period and cryptographic issuer signature against an existing trusted ISRG Root X1 before adding it.

The RSSHub-only startup installer appends to Node's existing default certificate list, including configured extra certificates. It preserves `NODE_EXTRA_CA_CERTS`, hostname validation, certificate verification, proxy settings and the host/system certificate store. The wrapper retains `dumb-init --` and existing Node options; the Dockerfile explicitly sets the verified pinned-base command `CMD ["npm", "run", "start"]`, because declaring a new ENTRYPOINT clears an inherited CMD.

The upstream npm start script replaces application `NODE_OPTIONS` with its HTTP header-size option. Therefore the CA installer is also imported first from the trusted compiled application entrypoint, so the app parent and each cluster child initialize the bridge regardless of that environment reset. The installer and its verification dependency are synchronous: no top-level await can allow another dependency to construct a TLS context before trust initialization. The entrypoint patcher rejects unfamiliar app import/cluster layouts and does not load user-supplied modules. The existing cluster and proxy behavior remain intact.

Node's certificate APIs require Node 22.19+ or 24.5+; unsupported runtimes fail the image verification/build rather than silently weakening checks. Optional runtime verification failure retains existing trust and emits only a fixed diagnostic.
