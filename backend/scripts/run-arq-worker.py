"""Compatibility entrypoint for arq on Python 3.14+.

Seed the main-thread event loop, import worker settings, and run arq directly
without going through the CLI's default logging configuration.
"""

import asyncio
import sys
from typing import NoReturn

from arq.utils import import_string
from arq.worker import run_worker


def main() -> NoReturn:
    """Seed the event loop and run the configured arq worker."""
    worker_settings_path = (
        sys.argv[1] if len(sys.argv) > 1 else "glean_worker.main.WorkerSettings"
    )
    asyncio.set_event_loop(asyncio.new_event_loop())
    worker_settings = import_string(worker_settings_path)
    run_worker(worker_settings)
    raise SystemExit(0)


if __name__ == "__main__":
    main()
