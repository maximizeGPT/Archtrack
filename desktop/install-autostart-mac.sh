#!/usr/bin/env bash
# ArchTrack: install the macOS launchd autostart agent so the tracker
# - launches when the user logs in (RunAtLoad)
# - restarts automatically after a crash OR after the Mac wakes from sleep
#   (KeepAlive + LimitLoadToSessionType=Aqua)
#
# This is the fix for the "laptop slept all day → 9h 45m tracking gap"
# incident we caught in the 2026-04-06 live audit.
#
# Usage:
#   cd desktop && ./install-autostart-mac.sh [--stealth]
#
# Re-running is safe — it unloads + overwrites the existing plist.
#
# Uninstall with:
#   launchctl unload ~/Library/LaunchAgents/com.archtrack.tracker.plist
#   rm ~/Library/LaunchAgents/com.archtrack.tracker.plist

set -euo pipefail

STEALTH=0
if [[ "${1:-}" == "--stealth" ]]; then STEALTH=1; fi

DESKTOP_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DESKTOP_DIR/.." && pwd)"
ELECTRON_BIN="$REPO_ROOT/node_modules/.bin/electron"
LABEL="com.archtrack.tracker"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_OUT="/tmp/archtrack-tracker.log"
LOG_ERR="/tmp/archtrack-tracker.err.log"

if [[ ! -x "$ELECTRON_BIN" ]]; then
  echo "ERROR: electron not found at $ELECTRON_BIN"
  echo "Run: cd $REPO_ROOT && npm install"
  exit 1
fi

# macOS TCC restriction: launchd-spawned processes cannot read files inside
# ~/Desktop, ~/Documents, or ~/Downloads without Full Disk Access. Detect
# that case and warn so the user knows what to do — the plist will install
# fine but Electron will EPERM on cli.js until the permission is granted.
case "$REPO_ROOT" in
  "$HOME/Desktop"/*|"$HOME/Documents"/*|"$HOME/Downloads"/*)
    echo ""
    echo "⚠️  WARNING: ArchTrack is installed under a TCC-protected folder ($REPO_ROOT)."
    echo "    macOS will block the launchd-spawned tracker from reading files"
    echo "    inside this folder until you grant Full Disk Access to:"
    echo "      $ELECTRON_BIN"
    echo "    System Settings → Privacy & Security → Full Disk Access → +"
    echo ""
    echo "    Recommended fix: move the repo to a non-protected location, e.g."
    echo "      mv \"$REPO_ROOT\" ~/Library/Application\\ Support/ArchTrack"
    echo "      cd ~/Library/Application\\ Support/ArchTrack/desktop"
    echo "      ./install-autostart-mac.sh${1:+ $1}"
    echo ""
    ;;
esac

# Find node so launchd can resolve the shebang in the electron wrapper
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  for candidate in /usr/local/bin/node /opt/homebrew/bin/node; do
    if [[ -x "$candidate" ]]; then NODE_BIN="$candidate"; break; fi
  done
fi
NODE_DIR="$(dirname "${NODE_BIN:-/usr/local/bin/node}")"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$ELECTRON_BIN</string>
    <string>$DESKTOP_DIR</string>
  </array>
  <key>WorkingDirectory</key><string>$DESKTOP_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$NODE_DIR:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>ARCHTRACK_STEALTH</key><string>$STEALTH</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>LimitLoadToSessionType</key><string>Aqua</string>
  <key>StandardOutPath</key><string>$LOG_OUT</string>
  <key>StandardErrorPath</key><string>$LOG_ERR</string>
  <key>ProcessType</key><string>Interactive</string>
</dict>
</plist>
PLIST

echo "Wrote $PLIST_PATH"

# Reload: unload old, load new
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "Loaded launchd agent '$LABEL'. Tracker will auto-start on login and auto-restart on crash/wake."
echo "Logs: $LOG_OUT"
if [[ "$STEALTH" == "1" ]]; then
  echo "Stealth mode: ON (no dock icon, no tray)"
else
  echo "Stealth mode: OFF. Re-run with --stealth to hide the dock/tray."
fi
