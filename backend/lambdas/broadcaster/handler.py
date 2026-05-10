"""Broadcaster — every 1s, push the active round's score hash to all WS clients.

Triggered by an EventBridge rule at 1-minute granularity (Schedule expressions
can't go lower). To get true 1Hz cadence the handler loops internally for
~55 seconds, sleeping 1s between iterations. This is fine because:
  - admin viewers are typically 1–5 connections
  - reading a small Redis hash + posting to a few connections is sub-100ms

If the WS connection is stale (GoneException), we delete it from the table.
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, ConnectTimeoutError, ReadTimeoutError

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
)

log = logging.getLogger()
log.setLevel(logging.INFO)

WS_TABLE = os.environ["WS_CONNECTIONS_TABLE"]
WS_ENDPOINT = os.environ["WS_ENDPOINT"]  # https://{api-id}.execute-api.{region}.amazonaws.com/{stage}
TICK_SECONDS = float(os.environ.get("TICK_SECONDS", "1.0"))
RUN_DURATION_SECONDS = int(os.environ.get("RUN_DURATION_SECONDS", "50"))

_table = boto3.resource("dynamodb").Table(WS_TABLE)
# Strict timeouts on the management API: a stale connection should fail fast,
# not block the whole 1Hz tick. With these caps, a worst-case post is ~4s.
_apigw = boto3.client(
    "apigatewaymanagementapi",
    endpoint_url=WS_ENDPOINT,
    config=Config(
        connect_timeout=2,
        read_timeout=2,
        retries={"max_attempts": 0},
    ),
)


def _build_payload() -> dict[str, Any] | None:
    r = get_client()
    round_id = r.get(CURRENT_ROUND_KEY)
    if not round_id:
        return None
    pipe = r.pipeline()
    pipe.hgetall(scores_key(round_id))
    pipe.hgetall(candidates_key(round_id))
    pipe.get(mode_key(round_id))
    pipe.get(current_song_key(round_id))
    scores_raw, cands_raw, mode, current_song_id = pipe.execute()
    mode = mode or MODE_TALENT
    scores = {cid: int(v) for cid, v in scores_raw.items()}
    candidates = [
        {"id": cid, "name": cands_raw.get(cid, cid), "score": scores.get(cid, 0)}
        for cid in cands_raw
    ]
    candidates.sort(key=lambda c: c["id"])

    payload: dict[str, Any] = {
        "type": "scores",
        "round_id": round_id,
        "mode": mode,
        "ts": int(time.time() * 1000),
        "candidates": candidates,
    }

    if mode == MODE_HIDDEN_SINGER and current_song_id:
        meta = r.hgetall(song_meta_key(round_id, current_song_id)) or {}
        likes = r.get(song_likes_key(round_id, current_song_id))
        if meta:
            payload["current_song"] = {
                "song_id": current_song_id,
                "candidate_id": meta.get("candidate_id"),
                "song_label": meta.get("song_label", ""),
                "likes": int(likes or 0),
            }

    return payload


def _list_connections() -> list[str]:
    items: list[str] = []
    last_key = None
    while True:
        kwargs: dict[str, Any] = {"ProjectionExpression": "connection_id"}
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key
        resp = _table.scan(**kwargs)
        items.extend(it["connection_id"] for it in resp.get("Items", []))
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
    return items


def _broadcast(payload_bytes: bytes, conn_ids: list[str]) -> int:
    """Post to every connection. Returns number of successful sends."""
    delivered = 0
    for cid in conn_ids:
        try:
            _apigw.post_to_connection(ConnectionId=cid, Data=payload_bytes)
            delivered += 1
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code")
            if code in ("GoneException", "410"):
                _table.delete_item(Key={"connection_id": cid})
            else:
                log.warning("post_to_connection failed for %s: %s", cid, code)
        except (ConnectTimeoutError, ReadTimeoutError):
            # The connection is unreachable; drop it so we don't keep timing out on it.
            log.warning("timeout posting to %s; removing", cid)
            try:
                _table.delete_item(Key={"connection_id": cid})
            except Exception:
                pass
    return delivered


def handler(_event: dict[str, Any], context) -> dict[str, Any]:
    end_at = time.time() + RUN_DURATION_SECONDS
    iterations = 0
    delivered_total = 0
    errors = 0

    while True:
        loop_start = time.time()
        if context and hasattr(context, "get_remaining_time_in_millis"):
            if context.get_remaining_time_in_millis() < 5000:
                break

        try:
            payload = _build_payload()
            if payload is not None:
                conn_ids = _list_connections()
                if conn_ids:
                    delivered_total += _broadcast(
                        json.dumps(payload).encode("utf-8"), conn_ids
                    )
        except Exception:
            errors += 1
            log.exception("tick failed; continuing")

        iterations += 1
        if time.time() >= end_at:
            break
        elapsed = time.time() - loop_start
        sleep_for = TICK_SECONDS - elapsed
        if sleep_for > 0:
            time.sleep(sleep_for)

    log.info(
        "broadcaster done: iterations=%d delivered=%d errors=%d",
        iterations,
        delivered_total,
        errors,
    )
    return {"iterations": iterations, "delivered": delivered_total, "errors": errors}
