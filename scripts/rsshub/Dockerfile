ARG RSSHUB_BASE_IMAGE
FROM ${RSSHUB_BASE_IMAGE}

COPY anthropic-research-adapter.mjs patch-anthropic-research.mjs podcast-detail-enrichment.mjs patch-source-reliability.mjs /opt/glean-rsshub/
RUN node /opt/glean-rsshub/patch-anthropic-research.mjs
RUN node /opt/glean-rsshub/patch-source-reliability.mjs
