#!/bin/bash
# Full diagnostic scanner

UDID=$(idevice_id -l 2>/dev/null | head -1)
[ -z "$UDID" ] && echo "No device" && exit 1

echo "=== Device Info ==="

# Basic info
IMEI=$(ideviceinfo -u "$UDID" -k InternationalMobileEquipmentIdentity 2>/dev/null)
SERIAL=$(ideviceinfo -u "$UDID" -k SerialNumber 2>/dev/null)
PRODUCT=$(ideviceinfo -u "$UDID" -k ProductType 2>/dev/null)
VERSION=$(ideviceinfo -u "$UDID" -k ProductVersion 2>/dev/null)
COLOR=$(ideviceinfo -u "$UDID" -k DeviceColor 2>/dev/null)
CAPACITY=$(ideviceinfo -u "$UDID" -k TotalDiskCapacity 2>/dev/null)
NAME=$(ideviceinfo -u "$UDID" -k DeviceName 2>/dev/null)

# Model mapping
case "$PRODUCT" in
  iPhone17,1|iPhone17,2) MODEL="iPhone 16 Pro"; YEAR="2024" ;;
  iPhone17,3|iPhone17,4) MODEL="iPhone 16"; YEAR="2024" ;;
  iPhone16,1|iPhone16,2) MODEL="iPhone 15 Pro"; YEAR="2023" ;;
  iPhone16,3|iPhone16,4) MODEL="iPhone 15"; YEAR="2023" ;;
  iPhone15,2|iPhone15,3) MODEL="iPhone 14 Pro"; YEAR="2022" ;;
  *) MODEL="$NAME"; YEAR="" ;;
esac

# Color
case "$COLOR" in
  1) COLORNAME="Black" ;; 2) COLORNAME="White" ;; 3) COLORNAME="Gold" ;;
  4) COLORNAME="Silver" ;; 5) COLORNAME="Blue" ;; *) COLORNAME="$COLOR" ;;
esac

# Storage
STORAGE=""
[ -n "$CAPACITY" ] && STORAGE="$((CAPACITY / 1000000000))GB"

# Battery diagnostics
echo "Checking battery..."
BATTERY=$(idevicediagnostics -u "$UDID" diagnostics GasGauge 2>/dev/null)
CYCLE=$(echo "$BATTERY" | grep -i "CycleCount" | grep -o '[0-9]*' | head -1)
DESIGN=$(echo "$BATTERY" | grep -i "DesignCapacity" | grep -o '[0-9]*' | head -1)
FULL=$(echo "$BATTERY" | grep -i "FullChargeCapacity" | grep -o '[0-9]*' | head -1)

HEALTH=""
if [ -n "$DESIGN" ] && [ -n "$FULL" ] && [ "$DESIGN" -gt 0 ]; then
  HEALTH=$((FULL * 100 / DESIGN))
fi

echo ""
echo "Model: $MODEL ($YEAR)"
echo "IMEI: $IMEI"
echo "Serial: $SERIAL"
echo "Storage: $STORAGE"
echo "Color: $COLORNAME"
echo "iOS: $VERSION"
echo "Battery Health: ${HEALTH}%"
echo "Battery Cycles: $CYCLE"

# Open browser with all params
PARAMS="imei=$IMEI&model=$(echo $MODEL|sed 's/ /%20/g')&storage=$STORAGE&serial=$SERIAL&color=$COLORNAME&year=$YEAR&ios=$VERSION&battery=$HEALTH&cycles=$CYCLE"
open "https://mobilerecellr.com.au/quick-add.html?$PARAMS"
