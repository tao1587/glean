ARG RSSHUB_BASE_IMAGE
FROM ${RSSHUB_BASE_IMAGE}

COPY anthropic-research-adapter.mjs patch-anthropic-research.mjs podcast-detail-enrichment.mjs patch-source-reliability.mjs /opt/glean-rsshub/
RUN node /opt/glean-rsshub/patch-anthropic-research.mjs
RUN node /opt/glean-rsshub/patch-source-reliability.mjs

COPY anthropic-engineering-adapter.mjs patch-anthropic-engineering.mjs the-batch-adapter.mjs patch-the-batch.mjs ainews-transform-adapter.mjs patch-html-ainews.mjs /opt/glean-rsshub/
RUN node /opt/glean-rsshub/patch-anthropic-engineering.mjs
RUN node /opt/glean-rsshub/patch-the-batch.mjs
RUN node /opt/glean-rsshub/patch-html-ainews.mjs

COPY public-ca-chain.mjs install-ca-chain.mjs patch-ca-entrypoint.mjs with-ca-chain.sh /opt/glean-rsshub/
COPY certs/root-yr-by-x1.pem /opt/glean-rsshub/certs/root-yr-by-x1.pem
RUN node /opt/glean-rsshub/public-ca-chain.mjs /opt/glean-rsshub/certs/root-yr-by-x1.pem \
    && chmod 755 /opt/glean-rsshub/with-ca-chain.sh
RUN node /opt/glean-rsshub/patch-ca-entrypoint.mjs

ENTRYPOINT ["dumb-init", "--", "/opt/glean-rsshub/with-ca-chain.sh"]
CMD ["npm", "run", "start"]
