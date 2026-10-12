# MR Scanner - USB Phone Detection

Desktop app for macOS and Windows that detects phones connected via USB and sends details to Mobile Recellr portal.

## Requirements

### macOS
```bash
brew install libimobiledevice
brew install android-platform-tools
```

### Windows
1. Install [iTunes](https://www.apple.com/itunes/) (for iPhone drivers)
2. Download [libimobiledevice Windows](https://github.com/libimobiledevice-win32/imobiledevice-net)
3. Install [ADB](https://developer.android.com/studio/releases/platform-tools)

## Setup

```bash
cd phone-scanner
npm install
npm start
```

## Build

```bash
# macOS
npm run build:mac

# Windows
npm run build:win
```

## Usage

1. Connect phone via USB
2. Trust computer on phone
3. Click "Scan USB Devices"
4. Enter buy price and condition
5. Click "Add to Inventory"

Device details (IMEI, model, serial) are auto-detected.
