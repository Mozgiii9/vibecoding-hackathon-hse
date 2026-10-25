"""Optional POSIX advisory lock shared with other heavy server operations."""

import importlib
from typing import BinaryIO, Protocol, cast


class PosixLockApi(Protocol):
    """Describe the POSIX-only API while keeping Windows type checks strict."""

    LOCK_EX: int
    LOCK_NB: int

    def flock(self, fd: BinaryIO, operation: int) -> None: ...


class HeavyOperationBusy(Exception):
    """Another cooperative operation already owns the shared resource."""


def acquire_heavy_lock(path: str | None) -> BinaryIO | None:
    """Acquire an existing coordination path without waiting or truncating it."""
    if not path:
        return None
    fcntl = cast(PosixLockApi, importlib.import_module("fcntl"))

    handle = open(path, "ab")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        raise HeavyOperationBusy from None
    except Exception:
        handle.close()
        raise
    return handle


def release_heavy_lock(handle: BinaryIO | None) -> None:
    """Close the descriptor, releasing the actual OS lock after work finishes."""
    if handle is not None:
        handle.close()
