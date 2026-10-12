#!/bin/bash
# Full device info scanner

if ! command -v ideviceinfo &> /dev/null; then
  echo "Install: brew install libimobiledevice"
  exit 1
fi

UDID=$(idevice_id -l 2>/dev/null | head -1)
[ -z "$UDID" ] && echo "No iPhone connected" && exit 1

# Grab all info
IMEI=$(ideviceinfo -u "$UDID" -k InternationalMobileEquipmentIdentity 2>/dev/null)
SERIAL=$(ideviceinfo -u "$UDID" -k SerialNumber 2>/dev/null)
PRODUCT=$(ideviceinfo -u "$UDID" -k ProductType 2>/dev/null)
VERSION=$(ideviceinfo -u "$UDID" -k ProductVersion 2>/dev/null)
COLOR=$(ideviceinfo -u "$UDID" -k DeviceColor 2>/dev/null)
ENCLOSURE=$(ideviceinfo -u "$UDID" -k DeviceEnclosureColor 2>/dev/null)
CAPACITY=$(ideviceinfo -u "$UDID" -k TotalDiskCapacity 2>/dev/null)
NAME=$(ideviceinfo -u "$UDID" -k DeviceName 2>/dev/null)

# Storage in GB
STORAGE=""
[ -n "$CAPACITY" ] && STORAGE="$((CAPACITY / 1000000000))GB"

# Model mapping
case "$PRODUCT" in
  iPhone17,1|iPhone17,2) MODEL="iPhone 16 Pro"; YEAR="2024" ;;
  iPhone17,3|iPhone17,4) MODEL="iPhone 16 Pro Max"; YEAR="2024" ;;
  iPhone16,1|iPhone16,2) MODEL="iPhone 15 Pro Max"; YEAR="2023" ;;
  iPhone16,3|iPhone16,4) MODEL="iPhone 15 Pro"; YEAR="2023" ;;
  iPhone15,2|iPhone15,3) MODEL="iPhone 14 Pro Max"; YEAR="2022" ;;
  iPhone15,4|iPhone15,5) MODEL="iPhone 14 Pro"; YEAR="2022" ;;
  iPhone14,2|iPhone14,3) MODEL="iPhone 13 Pro Max"; YEAR="2021" ;;
  *) MODEL="$NAME"; YEAR="" ;;
esac

# Color mapping
case "$COLOR" in
  1) COLORNAME="Black" ;;
  2) COLORNAME="White" ;;
  3) COLORNAME="Gold" ;;
  4) COLORNAME="Silver" ;;
  5) COLORNAME="Blue" ;;
  6) COLORNAME="Red" ;;
  *) COLORNAME="$COLOR" ;;
esac

echo "=== Device Info ==="
echo "Model: $MODEL ($YEAR)"
echo "IMEI: $IMEI"
echo "Serial: $SERIAL"
echo "Storage: $STORAGE"
echo "Color: $COLORNAME"
echo "iOS: $VERSION"

# Open browser with all params
PARAMS="imei=$IMEI&model=$(echo $MODEL|sed 's/ /%20/g')&storage=$STORAGE&serial=$SERIAL&color=$COLORNAME&year=$YEAR&ios=$VERSION"
open "https://mobilerecellr.com.au/quick-add.html?$PARAMS"
