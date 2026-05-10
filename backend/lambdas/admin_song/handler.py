"""POST /admin/round/song — start a new song session in a hidden_singer round.

Body:
{
  "candidate_id": "cand_A",
  "song_label": "이름 모를 소녀"
}

Behaviour (hidden_singer mode only):
- Generates a new song_id (uuid4).
- Stores meta in `round:{rid}:song:{sid}:meta` (candidate_id, song_label, started_at).
- Appends song_id to `round:{rid}:songs` (history list).
- Sets `round:{rid}:current_song = sid`.
- Sets `round:{rid}:state = 'open'` so likes are accepted immediately.

Returns the new song_id for the client to embed in subsequent vote payloads.

Requires `x-admin-token` header.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any

from shared.auth import is_authorised, unauthorised_response
from shared.redis_client import (
    CURRENT_ROUND_KEY,
    MODE_HIDDEN_SINGER,
    candidates_key,
    current_song_key,
    get_client,
    mode_key,
    song_likes_key,
    song_meta_key,
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
        candidate_id = body["candidate_id"]
        song_label = (body.get("song_label") or "").strip()
    except (KeyError, ValueError, TypeError) as e:
        return _resp(400, {"error": str(e)})

    r = get_client()
    round_id = r.get(CURRENT_ROUND_KEY)
    if not round_id:
        return _resp(409, {"error": "no active round"})

    mode = r.get(mode_key(round_id))
    if mode != MODE_HIDDEN_SINGER:
        return _resp(409, {"error": "current round is not hidden_singer mode"})

    cands = r.hgetall(candidates_key(round_id)) or {}
    if candidate_id not in cands:
        return _resp(400, {"error": f"unknown candidate_id: {candidate_id}"})

    song_id = uuid.uuid4().hex[:12]
    started_at = int(time.time() * 1000)

    pipe = r.pipeline(transaction=True)
    pipe.hset(
        song_meta_key(round_id, song_id),
        mapping={
            "candidate_id": candidate_id,
            "song_label": song_label,
            "started_at": started_at,
        },
    )
    pipe.set(song_likes_key(round_id, song_id), 0)
    pipe.rpush(songs_order_key(round_id), song_id)
    pipe.set(current_song_key(round_id), song_id)
    pipe.set(state_key(round_id), "open")
    pipe.execute()

    log.info(
        "song started: round=%s song=%s candidate=%s label=%r",
        round_id,
        song_id,
        candidate_id,
        song_label,
    )
    return _resp(
        200,
        {
            "round_id": round_id,
            "song_id": song_id,
            "candidate_id": candidate_id,
            "song_label": song_label,
            "started_at": started_at,
            "state": "open",
        },
    )
