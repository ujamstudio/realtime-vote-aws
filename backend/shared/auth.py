"""Shared admin token verification.

Tokens are passed via the `x-admin-token` header from the controller UI.
The expected value is read from the `ADMIN_TOKEN` env var, set by Terraform.
Comparison is constant-time to avoid timing leaks.
"""
from __future__ import annotations

import hmac
import os
from typing import Any


def _expected_token() -> str:
    return os.environ.get("ADMIN_TOKEN", "")


def _extract_header(event: dict[str, Any], name: str) -> str:
    headers = event.get("headers") or {}
    target = name.lower()
    for k, v in headers.items():
        if isinstance(k, str) and k.lower() == target:
            return v or ""
    return ""


def is_authorised(event: dict[str, Any]) -> bool:
    expected = _expected_token()
    if not expected:
        return False
    provided = _extract_header(event, "x-admin-token")
    return hmac.compare_digest(provided, expected)


def unauthorised_response() -> dict[str, Any]:
    return {
        "statusCode": 401,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": '{"error":"unauthorised"}',
    }
