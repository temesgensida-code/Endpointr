"""
NATS → Redis pub/sub bridge.

Subscribes to NATS subjects for run results, monitor incidents, and
completed runs. Republishes compact JSON events to Redis channel groups
that the Django Channels consumers subscribe to.

Run as a separate process:
    python manage.py run_bridge

Or directly:
    python -m realtime.bridge
"""
import asyncio
import json
import logging
import os

logger = logging.getLogger(__name__)


SUBJECTS = [
    "results.run.completed",
    "monitor.incident.opened",
    "monitor.incident.resolved",
    "results.metric",  # sampled — bridge throttles to 1 per second per run_id
]

# Throttle: only forward 1 metric event per (run_id, second) to avoid
# flooding the Channels layer at 10k VU throughput.
_LAST_METRIC: dict = {}


def _throttle_metric(payload: dict) -> bool:
    """Return True if this metric event should be forwarded."""
    run_id = payload.get("run_id", "")
    now_bucket = int(asyncio.get_event_loop().time())
    key = f"{run_id}:{now_bucket}"
    if key in _LAST_METRIC:
        return False
    _LAST_METRIC[key] = True
    # Prune old entries
    for k in list(_LAST_METRIC):
        if not k.startswith(f"{run_id}:"):
            continue
        ts = int(k.split(":")[-1])
        if now_bucket - ts > 5:
            del _LAST_METRIC[k]
    return True


def _group_for_subject(subject: str, payload: dict) -> list[str]:
    """Map a NATS subject + payload to one or more Channels group names."""
    groups = []
    run_id = payload.get("run_id", "")
    project_id = payload.get("project_id", "")
    monitor_id = payload.get("monitor_id", "")

    if subject == "results.run.completed":
        if run_id:
            groups.append(f"live:run:{run_id}")
        if project_id:
            groups.append(f"live:project:{project_id}:dashboard")

    elif subject == "results.metric":
        if run_id and _throttle_metric(payload):
            groups.append(f"live:run:{run_id}")

    elif subject in ("monitor.incident.opened", "monitor.incident.resolved"):
        if monitor_id:
            groups.append(f"live:monitor:{monitor_id}")
        if project_id:
            groups.append(f"live:project:{project_id}:dashboard")

    return groups


async def run_bridge(nats_url: str, channel_layer):
    """Main bridge coroutine."""
    try:
        import nats as nats_lib
    except ImportError:
        logger.error("nats-py not installed. Install with: pip install nats-py")
        return

    logger.info("Connecting to NATS at %s", nats_url)
    nc = await nats_lib.connect(nats_url)

    async def _handle(msg):
        try:
            payload = json.loads(msg.data.decode())
        except json.JSONDecodeError:
            return

        groups = _group_for_subject(msg.subject, payload)
        for group in groups:
            await channel_layer.group_send(
                group,
                {"type": "live.event", "payload": payload},
            )

    for subject in SUBJECTS:
        await nc.subscribe(subject, cb=_handle)
        logger.info("Subscribed to NATS subject: %s", subject)

    logger.info("Bridge running — forwarding NATS events to Redis channel groups")
    try:
        while True:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        pass
    finally:
        await nc.close()


def main():
    import django
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
    django.setup()

    from django.conf import settings
    from channels.layers import get_channel_layer

    nats_url = getattr(settings, "NATS_URL", "")
    if not nats_url:
        logger.error("NATS_URL not configured in settings — bridge cannot start.")
        return

    channel_layer = get_channel_layer()
    asyncio.run(run_bridge(nats_url, channel_layer))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
