from django.db import models


class ChatTurn(models.Model):
	ROLE_CHOICES = (
		("user", "User"),
		("assistant", "Assistant"),
	)

	clerk_user_id = models.CharField(max_length=255, db_index=True)
	conversation_id = models.CharField(max_length=100, default="default", db_index=True)
	role = models.CharField(max_length=20, choices=ROLE_CHOICES)
	content = models.TextField()
	created_at = models.DateTimeField(auto_now_add=True, db_index=True)

	class Meta:
		ordering = ["-created_at", "-id"]

	def __str__(self):
		return f"{self.clerk_user_id}:{self.conversation_id}:{self.role}"
