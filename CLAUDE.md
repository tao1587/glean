# CLAUDE.md

See [AGENTS.md](./AGENTS.md) — it is the canonical entry point for all agents (Codex, Claude Code, Cursor, etc.) working in this repo.

Root-level knowledge (stack, structure, commands, local docker, conventions) lives there. Sub-area guidance lives in nested `AGENTS.md` files (`backend/AGENTS.md`, `frontend/AGENTS.md`) — AI tools other than Claude Code auto-load the closest one by proximity. `docs/` is the system of record for deeper architecture, operations, and workflow spec.
