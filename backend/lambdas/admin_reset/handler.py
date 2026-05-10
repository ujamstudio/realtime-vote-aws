"""POST /admin/round/reset — start a new round (state initialised to 'closed').

Body:
{
  "new_round_id": "round_002",
  "mode": "talent" | "hidden_singer",   // optional, defaults to "talent"
  "candidates": [{"id": "cand_A", "name": "Artist A"}, ...]
}

Behaviour:
- Sets `global:current_round = new_round_id`.
- Resets `round:{new_round_id}:scores` so every candidate starts at 0.
- Stores candidate metadata in `round:{new_round_id}:candidates` (id → name).
- Initialises `round:{new_round_id}:state = 'closed'`.
- Stores mode in `round:{new_round_id}:mode`.
- For hidden_singer mode: clears any prior song state.

Requires `x-admin-token` header.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from shared.auth import is_authorised, unauthorised_response
from shared.redis_client import (
    ALLOWED_MODES,
    CURRENT_ROUND_KEY,
    MODE_TALENT,
    candidates_key,
    current_song_key,
    get_client,
    mode_key,
    scores_key,
    songs_order_key,
    state_key,
)

log = logging.getLogger()
log.setLevel(logging.INFO)


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
        new_round_id = body["new_round_id"]
        candidates = body["candidates"]
        mode = body.get("mode", MODE_TALENT)
        if mode not in ALLOWED_MODES:
            raise ValueError(f"mode must be one of {sorted(ALLOWED_MODES)}")
        if not isinstance(candidates, list) or not candidates:
            raise ValueError("candidates must be a non-empty list")
    except (KeyError, ValueError, TypeError) as e:
        return _resp(400, {"error": str(e)})

    r = get_client()

    # Clear any prior per-song state from a previous incarnation of this round id.
    prior_songs = r.lrange(songs_order_key(new_round_id), 0, -1) or []
    pipe = r.pipeline(transaction=True)

    pipe.delete(scores_key(new_round_id))
    pipe.delete(candidates_key(new_round_id))
    pipe.delete(current_song_key(new_round_id))
    pipe.delete(songs_order_key(new_round_id))
    for sid in prior_songs:
        pipe.delete(f"round:{new_round_id}:song:{sid}:meta")
        pipe.delete(f"round:{new_round_id}:song:{sid}:likes")

    score_init: dict[str, int] = {}
    cand_meta: dict[str, str] = {}
    for c in candidates:
        cid = c["id"]
        score_init[cid] = 0
        cand_meta[cid] = c.get("name", cid)
    pipe.hset(scores_key(new_round_id), mapping=score_init)
    pipe.hset(candidates_key(new_round_id), mapping=cand_meta)

    pipe.set(state_key(new_round_id), "closed")
    pipe.set(mode_key(new_round_id), mode)
    pipe.set(CURRENT_ROUND_KEY, new_round_id)
    pipe.execute()

    log.info(
        "round reset → %s mode=%s with %d candidates (state=closed)",
        new_round_id,
        mode,
        len(candidates),
    )
    return _resp(
        200,
        {
            "round_id": new_round_id,
            "mode": mode,
            "candidates": candidates,
            "state": "closed",
        },
    )
