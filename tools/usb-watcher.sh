#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"
LOG="$HOME/Library/Application Support/MobileRecellr/watcher.log"
SEEN="$HOME/Library/Application Support/MobileRecellr/seen.txt"

echo "Watcher started $(date)" >> "$LOG"

while true; do
  UDID=$(/opt/homebrew/bin/idevice_id -l 2>/dev/null | head -1)
  if [ -n "$UDID" ]; then
    if ! grep -q "$UDID" "$SEEN" 2>/dev/null; then
      echo "$UDID" > "$SEEN"
      echo "Device connected: $UDID $(date)" >> "$LOG"
      
      # Get basic info for URL
      IMEI=$(/opt/homebrew/bin/ideviceinfo -u "$UDID" -k InternationalMobileEquipmentIdentity 2>/dev/null)
      SERIAL=$(/opt/homebrew/bin/ideviceinfo -u "$UDID" -k SerialNumber 2>/dev/null)
      PRODUCT=$(/opt/homebrew/bin/ideviceinfo -u "$UDID" -k ProductType 2>/dev/null)
      
      case "$PRODUCT" in
        iPhone17,1|iPhone17,2) MODEL="iPhone 16 Pro" ;;
        iPhone17,3|iPhone17,4) MODEL="iPhone 16" ;;
        *) MODEL="iPhone" ;;
      esac
      
      PARAMS="imei=$IMEI&model=$(echo $MODEL|sed 's/ /%20/g')&serial=$SERIAL"
      /usr/bin/open "https://mobilerecellr.com.au/quick-add.html?$PARAMS"
      /usr/bin/osascript -e "display notification \"$MODEL connected\" with title \"MR Scanner\""
    fi
  else
    rm -f "$SEEN" 2>/dev/null
  fi
  sleep 2
done
