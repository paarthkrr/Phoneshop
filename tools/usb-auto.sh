#!/bin/bash
LOG=~/Desktop/usb-log.txt
echo "Watcher started $(date)" >> "$LOG"

while true; do
  UDID=$(idevice_id -l 2>/dev/null | head -1)
  if [ -n "$UDID" ]; then
    MARKER="$LOG.seen"
    if ! grep -q "$UDID" "$MARKER" 2>/dev/null; then
      echo "$UDID" >> "$MARKER"
      echo "Opening browser for $UDID $(date)" >> "$LOG"
      
      IMEI=$(ideviceinfo -u "$UDID" -k InternationalMobileEquipmentIdentity 2>/dev/null)
      SERIAL=$(ideviceinfo -u "$UDID" -k SerialNumber 2>/dev/null)
      PRODUCT=$(ideviceinfo -u "$UDID" -k ProductType 2>/dev/null)
      VERSION=$(ideviceinfo -u "$UDID" -k ProductVersion 2>/dev/null)
      COLOR=$(ideviceinfo -u "$UDID" -k DeviceColor 2>/dev/null)

      # Battery
      BATTERY=$(idevicediagnostics -u "$UDID" diagnostics GasGauge 2>/dev/null)
      CYCLE=$(echo "$BATTERY" | grep -i "CycleCount" | grep -o '[0-9]*' | head -1)
      DESIGN=$(echo "$BATTERY" | grep -i "DesignCapacity" | grep -o '[0-9]*' | head -1)
      FULL=$(echo "$BATTERY" | grep -i "FullChargeCapacity" | grep -o '[0-9]*' | head -1)
      HEALTH=""
      if [ -n "$DESIGN" ] && [ -n "$FULL" ] && [ "$DESIGN" -gt 0 ]; then
        HEALTH=$((FULL * 100 / DESIGN))
      fi

      
      case "$PRODUCT" in
        iPhone17,1|iPhone17,2) MODEL="iPhone 16 Pro"; YEAR="2024" ;;
        iPhone17,3|iPhone17,4) MODEL="iPhone 16"; YEAR="2024" ;;
        iPhone16,1|iPhone16,2) MODEL="iPhone 15 Pro"; YEAR="2023" ;;
        *) MODEL="iPhone"; YEAR="" ;;
      esac
      
      case "$COLOR" in
        1) COLORNAME="Black" ;; 2) COLORNAME="White" ;; *) COLORNAME="" ;;
      esac
      
      PARAMS="imei=$IMEI&model=$(echo $MODEL|sed 's/ /%20/g')&serial=$SERIAL&color=$COLORNAME&year=$YEAR&ios=$VERSION&battery=$HEALTH&cycles=$CYCLE"
      URL="https://mobilerecellr.com.au/quick-add.html?$PARAMS"
      
      echo "URL: $URL" >> "$LOG"
      /usr/bin/open "$URL"
      osascript -e "display notification \"$MODEL connected\" with title \"MR Scanner\""
    fi
  else
    rm -f "$LOG.seen" 2>/dev/null
  fi
  sleep 2
done
