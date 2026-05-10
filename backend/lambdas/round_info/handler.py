"""GET /round/current — return the active round id, candidate roster, state, and mode.

Mobile clients call this on load. The `state` field is one of:
  - "open"   — voting accepted
  - "closed" — voting paused or not yet started

The `mode` field is "talent" (default) or "hidden_singer".
For hidden_singer rounds, `current_song` is included with the active song session,
plus a `songs` array containing per-song breakdown for history display.
"""
from __future__ import annotations

import json
from typing import Any

from shared.redis_client import (
    CURRENT_ROUND_KEY,
    MODE_HIDDEN_SINGER,
    MODE_TALENT,
    candidates_key,
    current_song_key,
    get_client,
    mode_key,
    scores_key,
    song_likes_key,
    song_meta_key,
    songs_order_key,
    state_key,
)


def _resp(status: int, body: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
        },
        "body": json.dumps(body),
    }


def handler(_event: dict[str, Any], _context) -> dict[str, Any]:
    r = get_client()
    round_id = r.get(CURRENT_ROUND_KEY)
    if not round_id:
        return _resp(404, {"error": "no active round"})

    pipe = r.pipeline()
    pipe.hgetall(candidates_key(round_id))
    pipe.get(state_key(round_id))
    pipe.hgetall(scores_key(round_id))
    pipe.get(mode_key(round_id))
    pipe.get(current_song_key(round_id))
    cands, state, scores_raw, mode, current_song_id = pipe.execute()

    mode = mode or MODE_TALENT
    scores = {cid: int(v) for cid, v in (scores_raw or {}).items()}
    candidates = [
        {"id": cid, "name": name, "score": scores.get(cid, 0)}
        for cid, name in cands.items()
    ]
    candidates.sort(key=lambda c: c["id"])

    body: dict[str, Any] = {
        "round_id": round_id,
        "candidates": candidates,
        "state": state or "closed",
        "mode": mode,
    }

    if mode == MODE_HIDDEN_SINGER:
        body["current_song"] = _build_current_song(r, round_id, current_song_id)
        body["songs"] = _build_songs(r, round_id)

    return _resp(200, body)


def _build_current_song(r, round_id: str, song_id: str | None) -> dict[str, Any] | None:
    if not song_id:
        return None
    pipe = r.pipeline()
    pipe.hgetall(song_meta_key(round_id, song_id))
    pipe.get(song_likes_key(round_id, song_id))
    meta, likes = pipe.execute()
    if not meta:
        return None
    return {
        "song_id": song_id,
        "candidate_id": meta.get("candidate_id"),
        "song_label": meta.get("song_label", ""),
        "started_at": int(meta.get("started_at", 0) or 0),
        "likes": int(likes or 0),
    }


def _build_songs(r, round_id: str) -> list[dict[str, Any]]:
    sids = r.lrange(songs_order_key(round_id), 0, -1) or []
    if not sids:
        return []
    pipe = r.pipeline()
    for sid in sids:
        pipe.hgetall(song_meta_key(round_id, sid))
        pipe.get(song_likes_key(round_id, sid))
    raw = pipe.execute()
    out: list[dict[str, Any]] = []
    for i, sid in enumerate(sids):
        meta = raw[i * 2] or {}
        likes = raw[i * 2 + 1]
        out.append(
            {
                "song_id": sid,
                "candidate_id": meta.get("candidate_id"),
                "song_label": meta.get("song_label", ""),
                "started_at": int(meta.get("started_at", 0) or 0),
                "likes": int(likes or 0),
            }
        )
    return out
