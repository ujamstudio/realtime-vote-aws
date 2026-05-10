"""WebSocket $disconnect — remove the connectionId from the registry."""
from __future__ import annotations

import logging
import os
from typing import Any

import boto3

log = logging.getLogger()
log.setLevel(logging.INFO)

TABLE_NAME = os.environ["WS_CONNECTIONS_TABLE"]
_table = boto3.resource("dynamodb").Table(TABLE_NAME)


def handler(event: dict[str, Any], _context) -> dict[str, Any]:
    conn_id = event["requestContext"]["connectionId"]
    _table.delete_item(Key={"connection_id": conn_id})
    log.info("ws disconnect: %s", conn_id)
    return {"statusCode": 200}
