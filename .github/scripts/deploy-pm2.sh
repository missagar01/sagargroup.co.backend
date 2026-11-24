#!/usr/bin/env bash
set -euo pipefail

name=sagargroup-backend
app_dir=$(pwd -P)
health_url=http://127.0.0.1:3004/health
# Prevent simultaneous invocation on this runner, including manual runs of this script.
exec 9>"${RUNNER_TEMP:-/tmp}/sagargroup-backend-deploy.lock"
flock -n 9

inspect() {
  pm2 jlist | node -e '
  (() => {
    const fs = require("node:fs");
    const path = require("node:path");
    const [name, base, phase] = process.argv.slice(1);
    const list = JSON.parse(fs.readFileSync(0, "utf8"));
    const expected = path.join(base, "server.js");
    const entries = list.filter((app) => app.name === name);
    function fail(message) {
      console.error(message);
      process.exit(1);
    }
    if (entries.length > 1 || list.some((app) =>
      app.name !== name && app.pm2_env.pm_exec_path === expected)) {
      fail("Conflicting PM2 processes found. Inspect them before deploying.");
    }
    if (!entries.length) {
      if (phase === "verify") fail("Backend is missing from PM2");
      console.log("new");
      return;
    }
    const [app] = entries;
    const meta = app.pm2_env;
    const sameEntry = meta.pm_exec_path === expected;
    if (phase === "verify") {
      if (!sameEntry || meta.status !== "online" || meta.exec_mode !== "fork_mode" ||
          Number(meta.kill_timeout) !== 35000 || meta.wait_ready !== true || !app.pid) {
        fail("PM2 backend entry, status, or shutdown settings differ from the ecosystem configuration");
      }
      console.log(app.pid);
      return;
    }
    if (!sameEntry || meta.exec_mode !== "fork_mode") {
      const legacyNpm = /^npm(?:-cli\.js)?$/.test(path.basename(meta.pm_exec_path)) &&
        [meta.args].flat().includes("start") && meta.pm_cwd === base;
      if (!legacyNpm && !sameEntry) fail("Process name is already used by an unexpected entry point");
      console.log("replace " + app.pm_id);
    } else {
      console.log("restart");
    }
  })();
  ' "$name" "$app_dir" "$1"
}

plan=$(inspect plan)
if [[ "$plan" == replace\ * ]]; then
  pm2 delete "${plan#replace }"
fi
if [[ "$plan" != restart ]]; then
  listeners=$(ss -H -ltn 'sport = :3004')
  if [[ -n "$listeners" ]]; then
    echo "Port 3004 is already occupied. Resolve the conflict before starting PM2." >&2
    exit 1
  fi
fi
pm2 startOrRestart ecosystem.config.js --only "$name" --update-env

for attempt in {1..15}; do
  if pid=$(inspect verify) &&
    curl --fail --silent --show-error --max-time 2 "$health_url" |
    node -e '
      const data = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
      if (data.status !== "ok" || data.pid !== Number(process.argv[1])) process.exit(1);
    ' "$pid"; then
    pm2 save
    exit 0
  fi
  sleep 2
done

echo "Backend health verification failed. PM2 saved state was left unchanged." >&2
exit 1
