from django.db import models


class RequestHistory(models.Model):
	clerk_user_id = models.CharField(max_length=255, db_index=True)
	request_method = models.CharField(max_length=10)
	request_url = models.URLField(max_length=2048)
	response_status_code = models.IntegerField(null=True, blank=True)
	response_body = models.TextField()
	created_at = models.DateTimeField(auto_now_add=True, db_index=True)

	class Meta:
		ordering = ["-created_at", "-id"]

	def __str__(self):
		return f"{self.clerk_user_id} {self.request_method} {self.request_url}"
