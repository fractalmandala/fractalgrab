#!/bin/bash
# FractalGrab backup agent — called by launchd when the app is not running.
# Reads settings from config.json, zips the library folder, and prunes old backups.

CONFIG_DIR="$HOME/Library/Application Support/com.fractalgrab.app"
CONFIG="$CONFIG_DIR/config.json"
BACKUP_META="$CONFIG_DIR/backup-meta.json"
BACKUPS_DIR="$CONFIG_DIR/backups"

# Read library path from config
if [ ! -f "$CONFIG" ]; then
    exit 0
fi
LIBRARY=$(python3 -c "import json,sys; d=json.load(open('$CONFIG')); print(d.get('libraryPath',''))" 2>/dev/null)
if [ -z "$LIBRARY" ] || [ ! -d "$LIBRARY" ]; then
    exit 0
fi

# Check if backups are enabled and if one is due
if [ -f "$CONFIG_DIR/config.json" ]; then
    ENABLED=$(python3 -c "import json; d=json.load(open('$CONFIG')); print(d.get('settings',{}).get('backup',{}).get('enabled',False))" 2>/dev/null)
    if [ "$ENABLED" != "True" ]; then
        exit 0
    fi
    INTERVAL_H=$(python3 -c "import json; d=json.load(open('$CONFIG')); print(d.get('settings',{}).get('backup',{}).get('intervalHours',6))" 2>/dev/null)
    INTERVAL_H=${INTERVAL_H:-6}
fi

# Check last backup time
NOW_MS=$(python3 -c "import time; print(int(time.time()*1000))")
LAST_MS=0
if [ -f "$BACKUP_META" ]; then
    LAST_MS=$(python3 -c "import json; d=json.load(open('$BACKUP_META')); print(d.get('lastBackupAt',0))" 2>/dev/null)
    LAST_MS=${LAST_MS:-0}
fi

INTERVAL_MS=$((INTERVAL_H * 3600000))
DIFF=$((NOW_MS - LAST_MS))
if [ "$DIFF" -lt "$INTERVAL_MS" ] && [ "$LAST_MS" -ne 0 ]; then
    exit 0
fi

# Do the backup
mkdir -p "$BACKUPS_DIR"
TS=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUPS_DIR/fractalgrab-$TS.zip"
ditto -c -k --sequesterRsrc --keepParent "$LIBRARY" "$OUT" 2>/dev/null
if [ $? -ne 0 ]; then
    rm -f "$OUT"
    exit 1
fi

# Update meta
python3 -c "import json; json.dump({'lastBackupAt':$NOW_MS}, open('$BACKUP_META','w'))" 2>/dev/null

# Prune: keep only the 14 most recent
cd "$BACKUPS_DIR" 2>/dev/null || exit 0
ls -1t fractalgrab-*.zip 2>/dev/null | tail -n +15 | xargs rm -f 2>/dev/null
