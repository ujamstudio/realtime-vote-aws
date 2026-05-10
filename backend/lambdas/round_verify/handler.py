"""GET /admin/verify — health check for the admin token.

Frontend gates the UI by calling this once on login. 200 = correct password,
401 = wrong password.
"""
from __future__ import annotations

from typing import Any

from shared.auth import is_authorised, unauthorised_response


def handler(event: dict[str, Any], _context) -> dict[str, Any]:
    if not is_authorised(event):
        return unauthorised_response()
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": '{"ok":true}',
    }
