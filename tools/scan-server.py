#!/usr/bin/env python3
"""Local scan server - runs on Mac, web page calls this"""
import subprocess
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = 19876

class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()
    
    def do_GET(self):
        if self.path == '/scan':
            result = self.scan_device()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def scan_device(self):
        try:
            udid = subprocess.check_output(['/opt/homebrew/bin/idevice_id', '-l'], text=True).strip().split('\n')[0]
            if not udid:
                return {'error': 'No device connected'}
            
            def get(key):
                try:
                    return subprocess.check_output(['/opt/homebrew/bin/ideviceinfo', '-u', udid, '-k', key], text=True).strip()
                except:
                    return ''
            
            imei = get('InternationalMobileEquipmentIdentity')
            serial = get('SerialNumber')
            product = get('ProductType')
            version = get('ProductVersion')
            color = get('DeviceColor')
            # Get storage from disk_usage domain
            try:
                disk = subprocess.check_output(['/opt/homebrew/bin/ideviceinfo', '-u', udid, '-q', 'com.apple.disk_usage'], text=True)
                import re
                cap_m = re.search(r'TotalDiskCapacity:\s*(\d+)', disk)
                capacity = cap_m.group(1) if cap_m else ''
            except:
                capacity = ''

            
            # Model mapping
            models = {
                'iPhone17,1': ('iPhone 16 Pro', '2024'),
                'iPhone17,2': ('iPhone 16 Pro', '2024'),
                'iPhone17,3': ('iPhone 16', '2024'),
                'iPhone17,4': ('iPhone 16', '2024'),
                'iPhone16,1': ('iPhone 15 Pro', '2023'),
                'iPhone16,2': ('iPhone 15 Pro', '2023'),
            }
            model, year = models.get(product, ('iPhone', ''))
            
            colors = {'1': 'Black', '2': 'White', '3': 'Gold', '4': 'Silver', '5': 'Blue'}
            colorname = colors.get(color, color)
            
            storage = ''
            if capacity:
                storage = f"{int(capacity) // 1000000000}GB"
            
            # Battery
            battery_health = ''
            cycles = ''
            try:
                diag = subprocess.check_output(['/opt/homebrew/bin/idevicediagnostics', '-u', udid, 'diagnostics', 'GasGauge'], text=True, stderr=subprocess.DEVNULL)
                import re
                # Parse XML plist format
                cycle_m = re.search(r'<key>CycleCount</key>\s*<integer>(\d+)</integer>', diag)
                full_m = re.search(r'<key>FullChargeCapacity</key>\s*<integer>(\d+)</integer>', diag)
                if cycle_m:
                    cycles = cycle_m.group(1)
                if full_m:
                    # FullChargeCapacity appears to be percentage on some devices
                    val = int(full_m.group(1))
                    battery_health = str(val) if val <= 100 else str(val)
            
            # Battery from com.apple.mobile.battery
            try:
                batt = subprocess.check_output(["/opt/homebrew/bin/ideviceinfo", "-u", udid, "-q", "com.apple.mobile.battery"], text=True, stderr=subprocess.DEVNULL)
                import re
                cap_m = re.search(r"BatteryCurrentCapacity:\s*(\d+)", batt)
                if cap_m and not battery_health:
                    battery_health = cap_m.group(1)
            except:
                pass
            except:
                pass
            
            # Find My and Activation
            findmy = ''
            activation = ''
            try:
                full = subprocess.check_output(['/opt/homebrew/bin/ideviceinfo', '-u', udid], text=True)
                import re, base64
                # Find My status from NonVolatileRAM
                fm_m = re.search(r'fm-activation-locked:\s*(\S+)', full)
                if fm_m:
                    try:
                        findmy = base64.b64decode(fm_m.group(1)).decode()
                    except:
                        findmy = fm_m.group(1)
                # Activation state
                act_m = re.search(r'ActivationState:\s*(\S+)', full)
                if act_m:
                    activation = act_m.group(1)
            except:
                pass
            
            return {
                'imei': imei,
                'findmy': findmy,
                'activation': activation,
                'serial': serial,
                'model': model,
                'year': year,
                'storage': storage,
                'color': colorname,
                'ios': version,
                'battery': battery_health,
                'cycles': cycles
            }
        except Exception as e:
            return {'error': str(e)}
    
    def log_message(self, format, *args):
        pass

print(f"Scan server running on http://localhost:{PORT}")
print("Web page can call http://localhost:{PORT}/scan")
HTTPServer(('localhost', PORT), Handler).serve_forever()
