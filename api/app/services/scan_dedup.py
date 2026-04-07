"""In-memory scan deduplication lock.

Prevents duplicate in-flight scans for the same URL + user_id combination.
Anonymous users (user_id=None) bypass dedup entirely per D091.

Lock entries auto-expire after LOCK_TTL_SECONDS (60s) to prevent
unbounded dict growth and leaked locks from crashed requests.
"""

import time

LOCK_TTL_SECONDS: float = 60.0

# Maps "{url}:{user_id}" → acquisition timestamp
_in_flight: dict[str, float] = {}


def _cleanup_stale() -> None:
    """Remove entries older than LOCK_TTL_SECONDS from _in_flight."""
    now = time.time()
    stale_keys = [k for k, ts in _in_flight.items() if now - ts >= LOCK_TTL_SECONDS]
    for k in stale_keys:
        del _in_flight[k]


def try_acquire_scan(url: str, user_id: str | None) -> bool:
    """Try to acquire an in-flight lock for *url* + *user_id*.

    Returns True if the lock was acquired (scan may proceed).
    Returns False if a scan for this URL+user is already in progress.
    Anonymous users (user_id=None) always return True — no lock is created.
    """
    if user_id is None:
        return True

    # Housekeeping: evict stale entries to prevent unbounded growth
    _cleanup_stale()

    key = f"{url}:{user_id}"
    existing_ts = _in_flight.get(key)
    if existing_ts is not None and time.time() - existing_ts < LOCK_TTL_SECONDS:
        return False

    _in_flight[key] = time.time()
    return True


def release_scan(url: str, user_id: str | None) -> None:
    """Release an in-flight lock for *url* + *user_id*.

    No-op if user_id is None or if the key is not present.
    """
    if user_id is None:
        return
    key = f"{url}:{user_id}"
    _in_flight.pop(key, None)
