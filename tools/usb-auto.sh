#!/bin/bash
# Auto USB watcher - runs in background

LOG=~/Desktop/usb-log.txt
echo "Watcher started $(date)" >> "$LOG"

while true; do
  UDID=$(idevice_id -l 2>/dev/null | head -1)
  if [ -n "$UDID" ]; then
    # Check if we already processed this device
    if ! grep -q "$UDID" "$LOG" 2>/dev/null; then
      echo "New device: $UDID $(date)" >> "$LOG"
      
      IMEI=$(ideviceinfo -u "$UDID" -k InternationalMobileEquipmentIdentity 2>/dev/null)
      SERIAL=$(ideviceinfo -u "$UDID" -k SerialNumber 2>/dev/null)
      PRODUCT=$(ideviceinfo -u "$UDID" -k ProductType 2>/dev/null)
      VERSION=$(ideviceinfo -u "$UDID" -k ProductVersion 2>/dev/null)
      COLOR=$(ideviceinfo -u "$UDID" -k DeviceColor 2>/dev/null)
      
      case "$PRODUCT" in
        iPhone17,1|iPhone17,2) MODEL="iPhone 16 Pro Max"; YEAR="2024" ;;
        iPhone17,3|iPhone17,4) MODEL="iPhone 16 Pro"; YEAR="2024" ;;
        iPhone16,1|iPhone16,2) MODEL="iPhone 15 Pro Max"; YEAR="2023" ;;
        *) MODEL="iPhone"; YEAR="" ;;
      esac
      
      case "$COLOR" in
        1) COLORNAME="Black" ;; 2) COLORNAME="White" ;; *) COLORNAME="" ;;
      esac
      
      PARAMS="imei=$IMEI&model=$(echo $MODEL|sed 's/ /%20/g')&serial=$SERIAL&color=$COLORNAME&year=$YEAR&ios=$VERSION"
      
      # Open browser
      open "https://mobilerecellr.com.au/quick-add.html?$PARAMS"
      
      # Notification
      osascript -e "display notification \"$MODEL detected\" with title \"MR Scanner\""
    fi
  fi
  sleep 2
done
