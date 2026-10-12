#!/bin/bash
# Full USB Phone Scanner - grabs all available details

echo "Scanning..."

# iOS
if command -v idevice_id &> /dev/null; then
  UDID=$(idevice_id -l 2>/dev/null | head -1)
  if [ -n "$UDID" ]; then
    echo "iPhone detected"
    IMEI=$(ideviceinfo -u "$UDID" -k InternationalMobileEquipmentIdentity 2>/dev/null)
    MODEL=$(ideviceinfo -u "$UDID" -k ProductType 2>/dev/null)
    NAME=$(ideviceinfo -u "$UDID" -k DeviceName 2>/dev/null)
    SERIAL=$(ideviceinfo -u "$UDID" -k SerialNumber 2>/dev/null)
    VERSION=$(ideviceinfo -u "$UDID" -k ProductVersion 2>/dev/null)
    CAPACITY=$(ideviceinfo -u "$UDID" -k TotalDiskCapacity 2>/dev/null)
    COLOR=$(ideviceinfo -u "$UDID" -k DeviceColor 2>/dev/null)
    
    # Convert capacity to GB
    if [ -n "$CAPACITY" ]; then
      GB=$((CAPACITY / 1000000000))
      STORAGE="${GB}GB"
    fi
    
    # Map ProductType to friendly name
    case "$MODEL" in
      iPhone17,1|iPhone17,2) MODEL="iPhone 16 Pro Max" ;;
      iPhone17,3|iPhone17,4) MODEL="iPhone 16 Pro" ;;
      iPhone16,1|iPhone16,2) MODEL="iPhone 15 Pro Max" ;;
      iPhone15,2|iPhone15,3) MODEL="iPhone 14 Pro Max" ;;
      *) MODEL="$NAME" ;;
    esac
    
    echo "Model: $MODEL"
    echo "IMEI: $IMEI"
    echo "Storage: $STORAGE"
    echo "iOS: $VERSION"
    echo "Serial: $SERIAL"
    
    # URL encode and open
    PARAMS="imei=$IMEI&model=$(echo $MODEL | sed 's/ /%20/g')&storage=$STORAGE&serial=$SERIAL&ios=$VERSION"
    open "https://mobilerecellr.com.au/quick-add.html?$PARAMS"
    exit 0
  fi
fi

# Android
if command -v adb &> /dev/null; then
  DEVICE=$(adb devices 2>/dev/null | grep "device$" | head -1 | cut -f1)
  if [ -n "$DEVICE" ]; then
    echo "Android detected"
    MODEL=$(adb -s "$DEVICE" shell getprop ro.product.model 2>/dev/null | tr -d '\r')
    BRAND=$(adb -s "$DEVICE" shell getprop ro.product.brand 2>/dev/null | tr -d '\r')
    SERIAL=$(adb -s "$DEVICE" shell getprop ro.serialno 2>/dev/null | tr -d '\r')
    VERSION=$(adb -s "$DEVICE" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r')
    
    echo "Model: $BRAND $MODEL"
    echo "Android: $VERSION"
    echo "Serial: $SERIAL"
    
    PARAMS="model=$(echo "$BRAND $MODEL" | sed 's/ /%20/g')&serial=$SERIAL&android=$VERSION"
    open "https://mobilerecellr.com.au/quick-add.html?$PARAMS"
    exit 0
  fi
fi

echo "No device found"
