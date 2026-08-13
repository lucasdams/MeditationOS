"""Analytics event ingest + admin-summary schemas.

Two independent privacy guards live here:

1. `EVENT_NAMES` — a fixed ALLOWLIST of the ~handful of activation/retention events the
   client is allowed to send. An unknown name is a 422, so the endpoint can't be turned
   into an arbitrary spam / PII sink by posting made-up event names.

2. `props` validation — the context bag is capped hard (≤ MAX_PROP_KEYS keys, ≤ MAX_PROPS_BYTES
   serialized) and restricted to SCALAR values only (str/int/float/bool/None). Strings are
   length-capped. Nested objects/arrays are rejected. This keeps events tiny and makes it
   structurally hard to smuggle free-text PII (journal bodies, emails, names) into the table.
"""

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

# ── Event allowlist ─────────────────────────────────────────────────────────
# Only these names are accepted. Add a name here (and document it) before the client
# may emit it. Keep this list SMALL and meaningful — activation + retention signals.
EVENT_NAMES = frozenset(
    {
        "account_created",       # email/password signup completed
        "guest_started",         # anonymous guest session started
        "first_session_completed",  # the user's first-ever practice session
        "session_completed",     # any practice session saved (props: {"type": ...})
        "breathing_completed",   # a breathing session saved
        "streak_milestone",      # a streak crossed a milestone (props: {"days": N})
        "path_enrolled",         # enrolled in a beginner Path
        "spirit_path_chosen",    # picked a spirit companion path
        "journal_created",       # journal entry created
        "gratitude_created",     # gratitude entry created
    }
)

# Props limits — keep the context bag tiny and scalar-only.
MAX_PROP_KEYS = 20
MAX_PROPS_BYTES = 2048  # ≤ 2 KB serialized
MAX_STR_LEN = 200  # per string value / per key
MAX_KEY_LEN = 40

_Scalar = str | int | float | bool | None


class EventCreate(BaseModel):
    """A single anonymous usage event from the client.

    `extra="forbid"` rejects any field other than name/props (defence in depth against a
    client that tries to attach identifiers or free text at the top level)."""

    model_config = ConfigDict(extra="forbid")

    name: str
    props: dict[str, _Scalar] = {}

    @field_validator("name")
    @classmethod
    def _known_name(cls, v: str) -> str:
        # Allowlist gate: unknown event names are rejected outright (→ 422).
        if v not in EVENT_NAMES:
            raise ValueError("unknown event name")
        return v

    @field_validator("props")
    @classmethod
    def _small_scalar_props(cls, v: dict[str, _Scalar]) -> dict[str, _Scalar]:
        if len(v) > MAX_PROP_KEYS:
            raise ValueError(f"props may have at most {MAX_PROP_KEYS} keys")
        for key, value in v.items():
            if len(key) > MAX_KEY_LEN:
                raise ValueError(f"prop key too long (max {MAX_KEY_LEN} chars)")
            # bool is a subclass of int — allow it; reject only non-scalars. The dict[str,
            # _Scalar] annotation already coerces most cases, but guard explicitly so a
            # str-length or nested value can't slip through.
            if isinstance(value, str) and len(value) > MAX_STR_LEN:
                raise ValueError(f"prop string too long (max {MAX_STR_LEN} chars)")
            if not isinstance(value, (str, int, float, bool, type(None))):
                raise ValueError("prop values must be scalar (no nested objects/arrays)")
        # Hard byte cap on the serialized bag — belt-and-braces over the key/length caps.
        if len(json.dumps(v, separators=(",", ":")).encode("utf-8")) > MAX_PROPS_BYTES:
            raise ValueError(f"props too large (max {MAX_PROPS_BYTES} bytes)")
        return v


# ── Admin summary (aggregate counts only — never per-user event dumps) ───────


class EventNameCount(BaseModel):
    """Total occurrences of one event name over the window."""

    name: str
    count: int


class DailyActiveUsers(BaseModel):
    """Distinct users that emitted ≥1 event on a given UTC day."""

    day: str  # ISO date (YYYY-MM-DD)
    users: int


class AnalyticsEventSummary(BaseModel):
    """Aggregate product-analytics snapshot. Counts and distinct-user tallies ONLY —
    no individual event rows, no user identifiers, no props payloads."""

    window_days: int
    total_events: int
    events_by_name: list[EventNameCount]  # descending by count
    active_users_by_day: list[DailyActiveUsers]  # oldest → newest


# Allowed values for the admin summary window (bounds the query cost).
SummaryDays = Literal[7, 14, 30, 90]
