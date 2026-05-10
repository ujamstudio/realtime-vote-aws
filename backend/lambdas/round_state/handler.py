"""POST /admin/round/state — toggle voting open/closed for the current round.

Body: {"state": "open" | "closed"}

Requires `x-admin-token` header.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from shared.auth import is_authorised, unauthorised_response
from shared.redis_client import CURRENT_ROUND_KEY, get_client, state_key

log = logging.getLogger()
log.setLevel(logging.INFO)

ALLOWED = {"open", "closed"}


def _resp(status: int, body: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body),
    }


def handler(event: dict[str, Any], _context) -> dict[str, Any]:
    if not is_authorised(event):
        return unauthorised_response()

    try:
        body = json.loads(event.get("body") or "{}")
        new_state = body["state"]
        if new_state not in ALLOWED:
            raise ValueError(f"state must be one of {sorted(ALLOWED)}")
    except (KeyError, ValueError, TypeError) as e:
        return _resp(400, {"error": str(e)})

    r = get_client()
    round_id = r.get(CURRENT_ROUND_KEY)
    if not round_id:
        return _resp(409, {"error": "no active round"})

    r.set(state_key(round_id), new_state)
    log.info("round %s state → %s", round_id, new_state)
    return _resp(200, {"round_id": round_id, "state": new_state})
