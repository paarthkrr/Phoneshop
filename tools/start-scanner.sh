#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"
cd "$HOME/Library/Application Support/MobileRecellr"
exec /usr/bin/python3 scan-server.py
