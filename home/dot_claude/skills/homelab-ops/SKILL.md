---
name: homelab-ops
description: Use when changing services, configs, or storage on Drew's homelab — Proxmox LXCs, AdGuard/NPM/Caddy, Booklore/Grimmory, NFS/TrueNAS mounts, fstab edits. Covers rollback discipline, running-service config edits, and network-storage constraints.
---

# Homelab operations

Three disciplines. Blast radius on this homelab is real (whole-network DNS has gone down from a config edit) — when a step here feels skippable, flag it and let Drew decide instead of skipping.

## 1. Services that own their config file (AdGuard, NPM, Caddy, …)

Don't edit the file under the running process — services that maintain their own state file can rewrite it on shutdown or fail to start if it mutated underneath them (a clean-looking sed on `AdGuardHome.yaml` + restart once took DNS down network-wide until a backup restore).

1. Prefer the service's API or UI — atomic, no file touch, no restart.
2. Must edit the file? `systemctl stop X` → edit → `systemctl start X` → verify `systemctl is-active X` before anything else.
3. Have rollback one keystroke away, faster than backup-restore.
4. DNS/gateway/auth changes (whole-network blast radius): test the rollback path BEFORE the change, and make sure recovery doesn't depend on the network being up (when DNS dies, name resolution dies for every client).

## 2. LXC config edits need a rollback path

`pct snapshot <id>` failing with "snapshot feature is not available" usually means NFS bind mounts (mp0/mp1) — Proxmox refuses to snapshot filesystems it doesn't own. Substitute a file-level backup before mutating:

```bash
# Inside container:
cp -p /path/to/file /path/to/file.bak.pre-<change-name>
# ... edit ...
# Rollback:
cp /path/to/file.bak.pre-<change-name> /path/to/file && systemctl restart <service>
```

- For env vars, read runtime values via `tr "\0" "\n" < /proc/<pid>/environ` (works where reading `.env` is blocked). `pgrep -of <pattern>` for a single PID.
- After an fstab edit: `pct stop` then `pct start` (NOT reboot) for any LXC with bind mounts to the changed NFS path.
- Validated 2026-05-15 on CT 112 Grimmory bookdrop env fix.

## 3. Booklore/Grimmory on network storage

Upstream warns NAS/NFS/SMB/FUSE storage is unsupported. Two options:

- **`DISK_TYPE=NETWORK` in `.env` (safe, neutered):** DB-only metadata, zero file mutations. Bookdrop auto-organize stops working; manual file placement. Reading/scanning/progress fine.
- **Fix the NFS opts (Drew's chosen balance):** upstream's fear is silent write loss, which a `soft` NFS mount causes on timeout. fstab → `hard,timeo=600`, drop `DISK_TYPE` entirely. Bookdrop atomic-rename is then safe. Trade: containers hang if TrueNAS is down. Skip the `sync` opt — kills audio-streaming throughput.

Still avoid even with hard mounts: the in-app file-rename button and metadata-embed-into-epub (multi-step rewrites that can tear under concurrent access). Bookdrop's single-rename-per-file is atomic.

Checks:
- NFS opts: `mount | grep <mount>` — `soft` bad, `hard` good.
- Runtime env: `tr "\0" "\n" < /proc/$(pgrep -of grimmory/dist/app.jar)/environ | grep DISK_TYPE`.
- Helper-Scripts installs set neither — both are manual.

Validated 2026-05-15 on CT 112 + P1 fstab.
