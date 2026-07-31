"""
Django Channels WebSocket consumers for real-time dashboard updates.

Architecture:
  Go services → NATS results.* → bridge.py → Redis pub/sub live:* groups
  → these consumers → browser WebSocket

Each consumer authenticates via Clerk token (same as AI_handler consumer pattern),
then subscribes to a Redis channel group and forwards events to the client.
"""
import json
import logging

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.exceptions import DenyConnection

logger = logging.getLogger(__name__)


async def _authenticate(scope):
    """
    Single-user WebSocket authentication helper.
    Always returns 'single_user'.
    """
    return "single_user"




class RunLiveConsumer(AsyncJsonWebsocketConsumer):
    """
    ws://.../ws/runs/<run_id>/live/
    Streams real-time per-run metrics and status updates.
    Group name: live.run.<run_id>
    """

    async def websocket_connect(self, message):
        self.run_id = self.scope["url_route"]["kwargs"]["run_id"]
        user_id = await _authenticate(self.scope)
        if not user_id:
            await self.close(code=4001)
            return
        self.group_name = f"live.run.{self.run_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await super().websocket_connect(message)

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    # Receive a message forwarded by bridge.py via the channel layer
    async def live_event(self, event):
        await self.send_json(event.get("payload", {}))


class MonitorLiveConsumer(AsyncJsonWebsocketConsumer):
    """
    ws://.../ws/monitors/<monitor_id>/live/
    Streams real-time probe results and incident events.
    Group name: live.monitor.<monitor_id>
    """

    async def websocket_connect(self, message):
        self.monitor_id = self.scope["url_route"]["kwargs"]["monitor_id"]
        user_id = await _authenticate(self.scope)
        if not user_id:
            await self.close(code=4001)
            return
        self.group_name = f"live.monitor.{self.monitor_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await super().websocket_connect(message)

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def live_event(self, event):
        await self.send_json(event.get("payload", {}))


class ProjectDashboardConsumer(AsyncJsonWebsocketConsumer):
    """
    ws://.../ws/projects/<project_id>/live/
    Project-wide live events (run completions, incidents, schema diffs).
    Group name: live.project.<project_id>.dashboard
    """

    async def websocket_connect(self, message):
        self.project_id = self.scope["url_route"]["kwargs"]["project_id"]
        user_id = await _authenticate(self.scope)
        if not user_id:
            await self.close(code=4001)
            return
        self.group_name = f"live.project.{self.project_id}.dashboard"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await super().websocket_connect(message)

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def live_event(self, event):
        await self.send_json(event.get("payload", {}))
