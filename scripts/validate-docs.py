#!/usr/bin/env python3
"""Validate the repository docs structure and key references."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

REQUIRED_FILES = [
    "AGENTS.md",
    "backend/AGENTS.md",
    "frontend/AGENTS.md",
    "docs/index.md",
    "docs/architecture/index.md",
    "docs/operations/index.md",
    "docs/agent-workflows/index.md",
    "docs/product/index.md",
    "docs/references/index.md",
    "docs/generated/index.md",
    "docs/exec-plans/active/index.md",
]

FILES_TO_SCAN = [
    "AGENTS.md",
    "backend/AGENTS.md",
    "frontend/AGENTS.md",
    "docs/index.md",
    "docs/architecture/index.md",
    "docs/operations/index.md",
    "docs/agent-workflows/index.md",
    "docs/product/index.md",
    "docs/references/index.md",
    "CLAUDE.md",
    "README.md",
    "README.zh-CN.md",
]

MARKDOWN_LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
CODE_PATH_RE = re.compile(r"`((?:docs|backend|frontend|scripts)/[^`\s]+\.md)`")


def path_exists(path: Path) -> bool:
    return (ROOT / path).exists()


def normalize_reference(raw: str, source: Path) -> Path | None:
    if raw.startswith(("http://", "https://", "mailto:")):
        return None
    if raw.startswith("./") or raw.startswith("../"):
        return (source.parent / raw).resolve().relative_to(ROOT.resolve())  # type: ignore[return-value]
    return Path(raw)


def collect_paths(source: Path) -> set[Path]:
    text = source.read_text(encoding="utf-8")
    refs: set[Path] = set()
    for raw in MARKDOWN_LINK_RE.findall(text):
        normalized = normalize_reference(raw, source)
        if normalized is not None:
            refs.add(normalized)
    for raw in CODE_PATH_RE.findall(text):
        refs.add(Path(raw))
    return refs


def main() -> int:
    errors: list[str] = []

    for required in REQUIRED_FILES:
        if not path_exists(Path(required)):
            errors.append(f"Missing required docs file: {required}")

    for source_name in FILES_TO_SCAN:
        source = ROOT / source_name
        if not source.exists():
            errors.append(f"Missing file to validate: {source_name}")
            continue
        for ref in sorted(collect_paths(source)):
            if not path_exists(ref):
                errors.append(f"Broken reference in {source_name}: {ref}")

    if errors:
        print("Docs validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Docs validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
