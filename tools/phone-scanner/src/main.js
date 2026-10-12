const { app, BrowserWindow, ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 640,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'MR Scanner'
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// Detect connected devices
ipcMain.handle('detect-devices', async () => {
  const devices = [];
  
  // Try iOS (idevice_id from libimobiledevice)
  try {
    const ios = await run('idevice_id -l');
    if (ios.trim()) {
      for (const udid of ios.trim().split('\n')) {
        const info = await run(`ideviceinfo -u ${udid}`);
        const parsed = parseIdeviceInfo(info);
        if (parsed.imei) devices.push({ type: 'ios', ...parsed, udid });
      }
    }
  } catch (e) { /* libimobiledevice not installed */ }

  // Try Android (adb)
  try {
    const android = await run('adb devices');
    const lines = android.split('\n').slice(1).filter(l => l.includes('\tdevice'));
    for (const line of lines) {
      const serial = line.split('\t')[0];
      const model = await run(`adb -s ${serial} shell getprop ro.product.model`);
      const imei = await run(`adb -s ${serial} shell service call iphonesubinfo 1`);
      devices.push({ type: 'android', model: model.trim(), serial, imei: parseImei(imei) });
    }
  } catch (e) { /* adb not installed */ }

  return devices;
});

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 10000 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

function parseIdeviceInfo(info) {
  const get = (key) => {
    const m = info.match(new RegExp(`${key}:\\s*(.+)`));
    return m ? m[1].trim() : '';
  };
  return {
    model: get('ProductType') || get('DeviceName'),
    imei: get('InternationalMobileEquipmentIdentity'),
    serial: get('SerialNumber'),
    storage: get('TotalDiskCapacity')
  };
}

function parseImei(raw) {
  const m = raw.match(/'([0-9.]+)'/g);
  if (!m) return '';
  return m.map(s => s.replace(/['.]/g, '')).join('').slice(0, 15);
}

// Send to portal
ipcMain.handle('send-to-portal', async (event, device) => {
  const url = 'https://mobilerecellr.com.au/api/inventory/quick-add';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(device)
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
