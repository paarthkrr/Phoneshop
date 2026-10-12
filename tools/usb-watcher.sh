#!/bin/bash
# USB Watcher - runs in background, auto-opens quick-add when phone connects
# Add to Login Items to run at startup

LAST=""
while true; do
  # Check iOS
  if command -v idevice_id &> /dev/null; then
    UDID=$(idevice_id -l 2>/dev/null | head -1)
    if [ -n "$UDID" ] && [ "$UDID" != "$LAST" ]; then
      LAST="$UDID"
      IMEI=$(ideviceinfo -u "$UDID" -k InternationalMobileEquipmentIdentity 2>/dev/null)
      MODEL=$(ideviceinfo -u "$UDID" -k ProductType 2>/dev/null)
      osascript -e "display notification \"iPhone detected: $MODEL\" with title \"MR Scanner\""
      open "https://mobilerecellr.com.au/quick-add.html?imei=$IMEI&model=$MODEL"
    fi
  fi
  
  # Check Android
  if command -v adb &> /dev/null; then
    DEVICE=$(adb devices 2>/dev/null | grep "device$" | head -1 | cut -f1)
    if [ -n "$DEVICE" ] && [ "$DEVICE" != "$LAST" ]; then
      LAST="$DEVICE"
      MODEL=$(adb -s "$DEVICE" shell getprop ro.product.model 2>/dev/null | tr -d '\r')
      osascript -e "display notification \"Android detected: $MODEL\" with title \"MR Scanner\""
      open "https://mobilerecellr.com.au/quick-add.html?model=$MODEL"
    fi
  fi
  
  sleep 3
done
