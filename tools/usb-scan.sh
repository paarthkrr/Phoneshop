#!/bin/bash
# USB Phone Scanner - run this when phone is connected
# Usage: ./usb-scan.sh

echo "Scanning USB devices..."

# Check iOS
if command -v idevice_id &> /dev/null; then
  UDID=$(idevice_id -l 2>/dev/null | head -1)
  if [ -n "$UDID" ]; then
    echo "iPhone found: $UDID"
    IMEI=$(ideviceinfo -u "$UDID" -k InternationalMobileEquipmentIdentity 2>/dev/null)
    MODEL=$(ideviceinfo -u "$UDID" -k ProductType 2>/dev/null)
    SERIAL=$(ideviceinfo -u "$UDID" -k SerialNumber 2>/dev/null)
    echo "IMEI: $IMEI"
    echo "Model: $MODEL"
    echo "Serial: $SERIAL"
    
    # Open quick-add with prefilled data
    open "https://mobilerecellr.com.au/quick-add.html?imei=$IMEI&model=$MODEL&serial=$SERIAL"
    exit 0
  fi
fi

# Check Android
if command -v adb &> /dev/null; then
  DEVICE=$(adb devices 2>/dev/null | grep -v "List" | grep "device" | head -1 | cut -f1)
  if [ -n "$DEVICE" ]; then
    echo "Android found: $DEVICE"
    MODEL=$(adb -s "$DEVICE" shell getprop ro.product.model 2>/dev/null | tr -d '\r')
    SERIAL=$(adb -s "$DEVICE" shell getprop ro.serialno 2>/dev/null | tr -d '\r')
    echo "Model: $MODEL"
    echo "Serial: $SERIAL"
    
    open "https://mobilerecellr.com.au/quick-add.html?model=$MODEL&serial=$SERIAL"
    exit 0
  fi
fi

echo "No device found. Connect phone via USB and trust computer."
