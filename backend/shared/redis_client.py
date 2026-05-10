import os
import redis

_client: redis.Redis | None = None


def get_client() -> redis.Redis:
    """Cached Redis client reused across warm Lambda invocations."""
    global _client
    if _client is None:
        host = os.environ["REDIS_HOST"]
        port = int(os.environ.get("REDIS_PORT", "6379"))
        _client = redis.Redis(
            host=host,
            port=port,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
            health_check_interval=30,
        )
    return _client


CURRENT_ROUND_KEY = "global:current_round"

MODE_TALENT = "talent"
MODE_HIDDEN_SINGER = "hidden_singer"
ALLOWED_MODES = {MODE_TALENT, MODE_HIDDEN_SINGER}


def scores_key(round_id: str) -> str:
    return f"round:{round_id}:scores"


def candidates_key(round_id: str) -> str:
    return f"round:{round_id}:candidates"


def state_key(round_id: str) -> str:
    """Per-round voting state. Values: 'open' | 'closed'. Default: 'closed'."""
    return f"round:{round_id}:state"


def mode_key(round_id: str) -> str:
    """Per-round mode. Values: 'talent' | 'hidden_singer'. Default: 'talent'."""
    return f"round:{round_id}:mode"


# --- hidden_singer mode keys ---


def current_song_key(round_id: str) -> str:
    """Stores the active song_id for a hidden_singer round (or empty when no song)."""
    return f"round:{round_id}:current_song"


def song_meta_key(round_id: str, song_id: str) -> str:
    """Hash with fields: candidate_id, song_label, started_at."""
    return f"round:{round_id}:song:{song_id}:meta"


def song_likes_key(round_id: str, song_id: str) -> str:
    """Counter for likes on a single song session."""
    return f"round:{round_id}:song:{song_id}:likes"


def songs_order_key(round_id: str) -> str:
    """List (RPUSH) of song_ids in the order they were started, for history."""
    return f"round:{round_id}:songs"
