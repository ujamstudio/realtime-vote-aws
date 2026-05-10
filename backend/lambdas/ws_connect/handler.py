"""WebSocket $connect — store the connectionId in DynamoDB.

We persist active connections so the broadcaster Lambda (running on a
schedule) can iterate them. Connections expire via TTL in case
$disconnect ever fails to fire.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

import boto3

log = logging.getLogger()
log.setLevel(logging.INFO)

TABLE_NAME = os.environ["WS_CONNECTIONS_TABLE"]
TTL_SECONDS = 60 * 60 * 6  # 6h safety net

_table = boto3.resource("dynamodb").Table(TABLE_NAME)


def handler(event: dict[str, Any], _context) -> dict[str, Any]:
    conn_id = event["requestContext"]["connectionId"]
    _table.put_item(
        Item={
            "connection_id": conn_id,
            "connected_at": int(time.time()),
            "expires_at": int(time.time()) + TTL_SECONDS,
        }
    )
    log.info("ws connect: %s", conn_id)
    return {"statusCode": 200}
