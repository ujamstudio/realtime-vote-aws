"""SQS → Redis (HINCRBY) + DynamoDB (BatchWriteItem) worker.

Triggered by SQS with batch size up to 10. We aggregate per-candidate counts
across the batch and issue a single HINCRBY per candidate, which keeps Redis
write count bounded even under spike load. DynamoDB writes go through
BatchWriteItem (max 25 items per call) for the raw audit log.

Two voting flows:

  talent mode (default)
    Body: {"candidate_id": "cand_A", "device_id": "..."}
    → HINCRBY round:{rid}:scores cand_A by N

  hidden_singer mode
    Body: {"song_id": "<sid>", "device_id": "..."}
    → look up candidate_id from song meta (must match current_song)
    → HINCRBY round:{rid}:scores by 1 for that candidate
    → INCR round:{rid}:song:{sid}:likes
    Stale song_id messages (when admin already moved on) are dropped.

Partial-batch failure is reported via SQS `batchItemFailures`.
"""
from __future__ import annotations

import json
import logging
import os
import time
from collections import defaultdict
from typing import Any

import boto3

from shared.redis_client import (
    CURRENT_ROUND_KEY,
    MODE_HIDDEN_SINGER,
    MODE_TALENT,
    current_song_key,
    get_client,
    mode_key,
    scores_key,
    song_likes_key,
    song_meta_key,
    state_key,
)

log = logging.getLogger()
log.setLevel(logging.INFO)

TABLE_NAME = os.environ["VOTE_LOGS_TABLE"]
_ddb = boto3.resource("dynamodb")
_table = _ddb.Table(TABLE_NAME)


def handler(event: dict[str, Any], _context) -> dict[str, Any]:
    records = event.get("Records", [])
    if not records:
        return {"batchItemFailures": []}

    r = get_client()
    pipe = r.pipeline()
    pipe.get(CURRENT_ROUND_KEY)
    current_round, *_ = pipe.execute()
    if not current_round:
        log.error("no active round configured; dropping %d records", len(records))
        return {"batchItemFailures": []}

    pipe = r.pipeline()
    pipe.get(state_key(current_round))
    pipe.get(mode_key(current_round))
    pipe.get(current_song_key(current_round))
    round_state, mode, current_song_id = pipe.execute()
    round_state = round_state or "closed"
    mode = mode or MODE_TALENT

    if round_state != "open":
        log.warning(
            "round %s is %s; dropping %d records",
            current_round,
            round_state,
            len(records),
        )
        return {"batchItemFailures": []}

    failures: list[dict[str, str]] = []
    cand_counts: dict[str, int] = defaultdict(int)
    song_counts: dict[str, int] = defaultdict(int)
    log_items: list[dict[str, Any]] = []

    # Cache song_id → candidate_id lookups to avoid repeated Redis hits.
    song_candidate: dict[str, str | None] = {}

    for rec in records:
        msg_id = rec["messageId"]
        try:
            body = json.loads(rec["body"])
            device_id = body.get("device_id", "anon")

            if mode == MODE_HIDDEN_SINGER:
                song_id = body.get("song_id")
                if not song_id:
                    log.warning("hidden_singer record %s missing song_id", msg_id)
                    continue
                if song_id != current_song_id:
                    # Stale: user submitted a like for a song that's no longer active.
                    log.info(
                        "dropping stale like for song %s (current=%s)",
                        song_id,
                        current_song_id,
                    )
                    continue
                cand_id = song_candidate.get(song_id)
                if cand_id is None:
                    meta = r.hgetall(song_meta_key(current_round, song_id)) or {}
                    cand_id = meta.get("candidate_id")
                    song_candidate[song_id] = cand_id
                if not cand_id:
                    log.warning("song %s has no candidate meta; dropping", song_id)
                    continue
                cand_counts[cand_id] += 1
                song_counts[song_id] += 1
                log_items.append(
                    {
                        "round_id": current_round,
                        "ts_uuid": f"{int(time.time() * 1000)}#{msg_id}",
                        "candidate_id": cand_id,
                        "device_id": device_id,
                        "song_id": song_id,
                    }
                )
            else:
                cand_id = body["candidate_id"]
                cand_counts[cand_id] += 1
                log_items.append(
                    {
                        "round_id": current_round,
                        "ts_uuid": f"{int(time.time() * 1000)}#{msg_id}",
                        "candidate_id": cand_id,
                        "device_id": device_id,
                    }
                )
        except (KeyError, ValueError, TypeError) as e:
            log.warning("malformed message %s: %s", msg_id, e)
            continue  # poison pill — drop, don't redeliver

    try:
        pipe = r.pipeline(transaction=False)
        for cand, n in cand_counts.items():
            pipe.hincrby(scores_key(current_round), cand, n)
        for sid, n in song_counts.items():
            pipe.incrby(song_likes_key(current_round, sid), n)
        pipe.execute()
    except Exception:
        log.exception("redis write failed; redelivering full batch")
        return {"batchItemFailures": [{"itemIdentifier": rec["messageId"]} for rec in records]}

    try:
        with _table.batch_writer(overwrite_by_pkeys=["round_id", "ts_uuid"]) as batch:
            for item in log_items:
                batch.put_item(Item=item)
    except Exception:
        log.exception("dynamodb batch write failed (redis already credited)")
        # Counts are already in Redis; raw logs lost is recoverable but worth noting.
        # We do not redeliver — would double-count in Redis.

    return {"batchItemFailures": failures}
