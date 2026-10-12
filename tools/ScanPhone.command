#!/bin/bash
cd "$(dirname "$0")"

# Check for device
if ! command -v ideviceinfo &> /dev/null; then
  osascript -e 'display alert "Setup needed" message "Run once in Terminal: brew install libimobiledevice"'
  exit 1
fi

UDID=$(idevice_id -l 2>/dev/null | head -1)
if [ -z "$UDID" ]; then
  osascript -e 'display alert "No iPhone" message "Connect iPhone via USB and tap Trust"'
  exit 1
fi

# Get info
IMEI=$(ideviceinfo -u "$UDID" -k InternationalMobileEquipmentIdentity 2>/dev/null)
SERIAL=$(ideviceinfo -u "$UDID" -k SerialNumber 2>/dev/null)
PRODUCT=$(ideviceinfo -u "$UDID" -k ProductType 2>/dev/null)
VERSION=$(ideviceinfo -u "$UDID" -k ProductVersion 2>/dev/null)
CAPACITY=$(ideviceinfo -u "$UDID" -k TotalDiskCapacity 2>/dev/null)
COLOR=$(ideviceinfo -u "$UDID" -k DeviceColor 2>/dev/null)

STORAGE=""
[ -n "$CAPACITY" ] && STORAGE="$((CAPACITY / 1000000000))GB"

case "$PRODUCT" in
  iPhone17,1|iPhone17,2) MODEL="iPhone 16 Pro Max"; YEAR="2024" ;;
  iPhone17,3|iPhone17,4) MODEL="iPhone 16 Pro"; YEAR="2024" ;;
  iPhone16,1|iPhone16,2) MODEL="iPhone 15 Pro Max"; YEAR="2023" ;;
  iPhone16,3|iPhone16,4) MODEL="iPhone 15 Pro"; YEAR="2023" ;;
  *) MODEL="iPhone"; YEAR="" ;;
esac

case "$COLOR" in
  1) COLORNAME="Black" ;; 2) COLORNAME="White" ;; 3) COLORNAME="Gold" ;;
  4) COLORNAME="Silver" ;; 5) COLORNAME="Blue" ;; *) COLORNAME="" ;;
esac

PARAMS="imei=$IMEI&model=$(echo $MODEL|sed 's/ /%20/g')&storage=$STORAGE&serial=$SERIAL&color=$COLORNAME&year=$YEAR&ios=$VERSION"
open "https://mobilerecellr.com.au/quick-add.html?$PARAMS"
