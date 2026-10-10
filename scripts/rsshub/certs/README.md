# Public certificate bridge

`root-yr-by-x1.pem` is the official ISRG Root YR certificate cross-signed by the already trusted ISRG Root X1. It completes the Let's Encrypt `website → YR1 → Root YR → ISRG Root X1` chain when a publisher omits the cross-signed bridge. This file contains only a public CA certificate.

- Source: [official PEM](https://letsencrypt.org/certs/gen-y/root-yr-by-x1.pem)
- Provenance and default chain: [Let's Encrypt certificates](https://letsencrypt.org/certificates/)
- DER SHA-256: `072639d0b140d5bffae16ad9c3f6cc6086040621f51ee61a6d46a8915c07cf76`
- Verification: `public-ca-chain.mjs` checks the pin, CA property, validity period and cryptographic issuer signature against an existing trusted ISRG Root X1 before adding it.

The RSSHub-only preload appends to Node's existing default certificate list, including configured extra certificates. It preserves `NODE_EXTRA_CA_CERTS`, hostname validation, certificate verification, proxy settings and the host/system certificate store. The entrypoint retains `dumb-init --` and adds the preload to existing `NODE_OPTIONS`. The Dockerfile explicitly restores the verified pinned base command `CMD ["npm", "run", "start"]`, because declaring a new ENTRYPOINT clears an inherited CMD. Node's certificate APIs require Node 22.19+ or 24.5+; unsupported runtimes fail the image verification/build rather than silently weakening checks.
