import time
import concurrent.futures
from django.core.management.base import BaseCommand
from monitoring.models import Monitor
from monitoring.prober import execute_single_probe


class Command(BaseCommand):
    help = "Runs continuous background health probes for active monitors."

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Starting Endpointr Monitor Probe Daemon..."))

        last_probed = {}

        while True:
            try:
                monitors = list(Monitor.objects.filter(active=True))
                now = time.time()
                to_probe = []

                for mon in monitors:
                    interval = mon.interval_seconds or 60
                    last_time = last_probed.get(str(mon.id), 0)
                    if now - last_time >= interval:
                        to_probe.append(mon)
                        last_probed[str(mon.id)] = now

                if to_probe:
                    self.stdout.write(f"Probing {len(to_probe)} active monitor(s)...")
                    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                        futures = [executor.submit(execute_single_probe, m) for m in to_probe]
                        for f in concurrent.futures.as_completed(futures):
                            try:
                                log = f.result()
                                self.stdout.write(
                                    f"Probe [{log.monitor.name}]: status={log.status_code}, "
                                    f"latency={log.latency_ms}ms, success={log.success}"
                                )
                            except Exception as e:
                                self.stderr.write(f"Probe error: {e}")

            except Exception as outer_err:
                self.stderr.write(f"Daemon loop error: {outer_err}")

            time.sleep(2)
