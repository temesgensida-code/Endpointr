from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Run the NATS→Redis Channels bridge for real-time dashboard events."

    def handle(self, *args, **options):
        self.stdout.write("Starting NATS→Redis bridge...")
        from realtime.bridge import main
        main()
