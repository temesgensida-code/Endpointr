"""
NATS client helper for publishing events to the execution plane.

In development (NATS_URL not set), events are logged instead of published
so the Django control-plane can be developed and tested without NATS running.
In production, set NATS_URL in the environment.
"""
import json
import logging
from django.conf import settings

logger = logging.getLogger(__name__)


def publish_event(subject: str, payload: dict) -> bool:
    """
    Publish a JSON payload to a NATS subject.

    Returns True on success, False if NATS is unavailable and the
    event was only logged (dev fallback).
    """
    nats_url = getattr(settings, "NATS_URL", "")

    if not nats_url:
        logger.info(
            "[NATS-STUB] subject=%s payload=%s",
            subject, json.dumps(payload, default=str)
        )
        return False

    try:
        # nats-py is an async library; we use the sync helper via asyncio.
        import asyncio
        import nats

        async def _publish():
            nc = await nats.connect(nats_url)
            await nc.publish(subject, json.dumps(payload, default=str).encode())
            await nc.flush()
            await nc.close()

        asyncio.run(_publish())
        return True

    except Exception as exc:  # pragma: no cover
        logger.exception("[NATS] Failed to publish to %s: %s", subject, exc)
        return False
