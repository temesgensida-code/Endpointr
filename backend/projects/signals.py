# Signals removed — project creation is now triggered by the API (POST /projects/)
# when a user sets up their workspace the first time. No Django User signal needed
# since identity is Clerk-managed.
