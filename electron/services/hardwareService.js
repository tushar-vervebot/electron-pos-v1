'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { SerialPort } = require('serialport');
const WebSocket = require('ws');

const weightReadInFlight = new Map();
const scannerReadInFlight = new Map();
const scannerBlockedUntil = new Map();

function execPowerShell(script, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: timeoutMs },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || error.message || 'PowerShell failed').trim()));
          return;
        }
        resolve((stdout || '').trim());
      }
    );
  });
}

function parseJsonArray(raw) {
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function normalizePrinter(item) {
  const portName = item.PortName || '';
  const name = item.Name || '';
  const isUsbPort = /^USB/i.test(portName);
  const isLikelyReceipt = /(receipt|pos|thermal|epson|xprinter|bixolon|star)/i.test(name);

  return {
    name,
    portName,
    driverName: item.DriverName || '',
    isDefault: Boolean(item.Default),
    isOffline: Boolean(item.WorkOffline),
    isUsbPort,
    isLikelyReceipt,
  };
}

async function listPrinters() {
  const script = "Get-CimInstance Win32_Printer | Select-Object Name,PortName,DriverName,Default,WorkOffline | ConvertTo-Json -Depth 3";
  const raw = await execPowerShell(script);
  return parseJsonArray(raw).map(normalizePrinter);
}

function buildPrinterText(title, body) {
  const now = new Date().toLocaleString();
  return [
    '================================',
    title || 'POS System Printer Test',
    `Printed: ${now}`,
    '--------------------------------',
    body || 'USB printer communication setup is working.',
    '================================',
  ].join('\r\n');
}

async function printText({ printerName, title, body }) {
  if (!printerName || typeof printerName !== 'string') {
    throw new Error('printerName is required.');
  }

  const tmpPath = path.join(os.tmpdir(), `pos-print-${Date.now()}.txt`);
  const text = buildPrinterText(title, body);
  fs.writeFileSync(tmpPath, text, 'utf8');

  const escapedPrinter = printerName.replace(/'/g, "''");
  const escapedPath = tmpPath.replace(/'/g, "''");
  const script = `Get-Content -Path '${escapedPath}' | Out-Printer -Name '${escapedPrinter}'`;

  try {
    await execPowerShell(script, 20000);
    return { success: true, printerName };
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
}

function normalizePort(port) {
  const pnpId = (port.pnpId || '').toLowerCase();
  return {
    path: port.path,
    manufacturer: port.manufacturer || '',
    friendlyName: port.friendlyName || '',
    vendorId: port.vendorId || '',
    productId: port.productId || '',
    serialNumber: port.serialNumber || '',
    isUsb: pnpId.includes('usb') || Boolean(port.vendorId),
  };
}

async function listSerialPorts() {
  const ports = await SerialPort.list();
  return ports.map(normalizePort);
}

function parseWeightValue(raw) {
  const text = String(raw || '').replace(/\0/g, '').trim();
  const match = text.match(/([-+]?\d+(?:\.\d+)?)/);
  if (!match) {
    return { raw: text, value: null, unit: null };
  }

  const unitMatch = text.match(/\b(kg|g|lb|lbs|oz)\b/i);
  return {
    raw: text,
    value: Number(match[1]),
    unit: unitMatch ? unitMatch[1].toLowerCase() : null,
  };
}

/**
 * launchScaleServer — starts the scale exe if it is not already running.
 * Returns { ok, message }.
 */
function launchScaleServer(options = {}) {
  const { exePath } = options;

  if (!exePath) {
    return Promise.resolve({ ok: false, message: 'exePath is required.' });
  }

  return new Promise((resolve) => {
    fs.access(exePath, fs.constants.F_OK, (accessErr) => {
      if (accessErr) {
        resolve({ ok: false, message: `Scale exe not found at: ${exePath}` });
        return;
      }

      try {
        const { execFile } = require('child_process');
        const exeDir = path.dirname(exePath);
        execFile(exePath, [], {
          cwd: exeDir,
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        }, (err) => {
          if (err && err.code !== 'ENOENT') {
            resolve({ ok: false, message: `Failed to launch: ${err.message}` });
          }
        });
        resolve({ ok: true, message: `Launched: ${path.basename(exePath)}` });
      } catch (err) {
        resolve({ ok: false, message: `Launch error: ${err.message}` });
      }
    });
  });
}

/**
 * readWeightFromScaleServer — connects to the running scale WebSocket server
 * (scale_latest_w_id.exe on ws://127.0.0.1:8765).
 *
 * Protocol (confirmed from logs):
 *   - Client MUST send a numeric trigger message after connecting, otherwise
 *     the server stays silent.
 *   - Server then streams weight strings every ~300 ms ("0.0", "000.17", etc.)
 *   - Server sends "==" when the weight is stable → return immediately.
 *   - On timeout → return lastNumeric if any data was received (best effort).
 */
function readWeightFromScaleServer(options = {}) {
  const {
    url = 'ws://127.0.0.1:8765',
    timeoutMs = 6000,
  } = options;

  const key = url;
  if (weightReadInFlight.has(key)) {
    return weightReadInFlight.get(key);
  }

  const readPromise = new Promise((resolve) => {
    let settled = false;
    let lastNumeric = null;
    let ws;

    const buildPayload = (numeric) => {
      const parsed = parseWeightValue(String(numeric));
      return {
        ok: true,
        url,
        raw: String(numeric),
        value: parsed.value !== null ? parsed.value : numeric,
        unit: parsed.unit || 'kg',
        capturedAt: new Date().toISOString(),
      };
    };

    const done = (err, payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { if (ws && ws.readyState <= 1) ws.close(); } catch (_) {}
      weightReadInFlight.delete(key);
      if (err) {
        resolve({ ok: false, code: err.code || 'SCALE_ERROR', url, error: err.message || String(err) });
      } else {
        resolve(payload);
      }
    };

    const timer = setTimeout(() => {
      if (lastNumeric !== null) {
        done(null, buildPayload(lastNumeric));
        return;
      }
      const e = new Error('Scale server connected but sent no weight data. Check that the scale is powered and COM4 is connected.');
      e.code = 'SCALE_NO_DATA';
      done(e);
    }, timeoutMs);

    try {
      ws = new WebSocket(url);
    } catch (err) {
      err.code = 'SCALE_WS_CREATE_FAILED';
      done(err);
      return;
    }

    ws.on('error', (err) => {
      const msg = String(err.message || err);
      const friendly = /ECONNREFUSED/i.test(msg)
        ? `Scale server not running at ${url}. Click "Start Scale" first.`
        : `Scale WebSocket error: ${msg}`;
      const e = new Error(friendly);
      e.code = 'SCALE_CONNECT_FAILED';
      done(e);
    });

    ws.on('open', () => {
      // Server requires a numeric trigger before it responds.
      // scale_latest_w_id.exe responds with a single JSON: {"id":"...","weight":0.18}
      ws.send('100001');
    });

    ws.on('message', (data) => {
      const text = String(data).trim();

      // Handle JSON response from scale_latest_w_id.exe: {"id":"...","weight":0.18}
      if (text.startsWith('{')) {
        try {
          const parsed = JSON.parse(text);
          if (parsed && parsed.weight !== undefined) {
            const w = parseFloat(parsed.weight);
            if (!isNaN(w)) {
              done(null, {
                ok: true,
                url,
                raw: text,
                value: w,
                unit: 'kg',
                capturedAt: new Date().toISOString(),
              });
              return;
            }
          }
        } catch (_) {}
      }

      // Handle legacy streaming protocol: plain "==" stable sentinel
      if (text === '==') {
        if (lastNumeric !== null) {
          done(null, buildPayload(lastNumeric));
        }
        return;
      }

      // Handle legacy plain numeric stream: "000.17", "0.0", etc.
      const num = parseFloat(text);
      if (!isNaN(num)) {
        lastNumeric = num;
      }
    });
  });

  weightReadInFlight.set(key, readPromise);
  return readPromise;
}

// Keep previous direct-serial function as a fallback for environments
// where the scale exe is not in use.
function readWeightOnce(options = {}) {
  return readWeightFromScaleServer(options);
}

function parseScannerValue(raw) {
  const text = String(raw || '').replace(/\0/g, '').trim();
  return text;
}

function readScannerOnce(options = {}) {
  const {
    path: portPath,
    baudRate = 9600,
    dataBits = 7,
    stopBits = 1,
    parity = 'even',
    timeoutMs = 4000,
  } = options;

  if (!portPath) {
    return Promise.resolve({
      ok: false,
      code: 'MISSING_PORT',
      error: 'Scanner port path is required (for example COM4).',
    });
  }

  const now = Date.now();
  const blockedUntil = scannerBlockedUntil.get(portPath) || 0;
  if (blockedUntil > now) {
    const waitSec = Math.ceil((blockedUntil - now) / 1000);
    return Promise.resolve({
      ok: false,
      code: 'PORT_BLOCKED',
      portPath,
      error: `Scanner port ${portPath} is temporarily blocked after access denied. Wait ${waitSec}s and try again.`,
    });
  }

  if (scannerReadInFlight.has(portPath)) {
    return scannerReadInFlight.get(portPath);
  }

  const readPromise = new Promise((resolve, reject) => {
    let settled = false;
    const port = new SerialPort({
      path: portPath,
      baudRate,
      dataBits,
      stopBits,
      parity,
      autoOpen: false,
    });

    const done = (err, payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const finalize = () => {
        scannerReadInFlight.delete(portPath);
        if (err) {
          resolve({
            ok: false,
            code: err.code || 'SCANNER_ERROR',
            portPath,
            error: err.message || String(err),
          });
        } else {
          resolve(payload);
        }
      };

      if (port.isOpen) {
        port.close(() => finalize());
      } else {
        finalize();
      }
    };

    const timer = setTimeout(() => {
      const timeoutError = new Error('Scanner read timeout. Scan a barcode while listening is active.');
      timeoutError.code = 'SCANNER_TIMEOUT';
      done(timeoutError);
    }, timeoutMs);

    let buffer = '';

    port.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const hasLine = /\r|\n/.test(buffer);
      if (!hasLine && buffer.length < 3) return;

      const lines = buffer.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      if (lines.length === 0) return;

      const value = parseScannerValue(lines[lines.length - 1]);
      if (value) {
        done(null, {
          ok: true,
          portPath,
          value,
          capturedAt: new Date().toISOString(),
        });
      }
    });

    port.on('error', (err) => {
      const message = String(err.message || err);
      if (/access denied/i.test(message)) {
        scannerBlockedUntil.set(portPath, Date.now() + 10000);
          const deniedError = new Error(`Unable to open scanner port ${portPath}: Access denied. Close any other app using this COM port (scanner service, serial monitor, old POS app) and retry.`);
          deniedError.code = 'ACCESS_DENIED';
          done(deniedError);
        return;
      }
        const openError = new Error(`Unable to open scanner port ${portPath}: ${message}`);
        openError.code = 'OPEN_FAILED';
        done(openError);
    });

    port.open((err) => {
      if (err) {
        const message = String(err.message || err);
        if (/access denied/i.test(message)) {
          scannerBlockedUntil.set(portPath, Date.now() + 10000);
          const deniedError = new Error(`Unable to open scanner port ${portPath}: Access denied. Close any other app using this COM port and retry.`);
          deniedError.code = 'ACCESS_DENIED';
          done(deniedError);
          return;
        }
        const openError = new Error(`Unable to open scanner port ${portPath}: ${message}`);
        openError.code = 'OPEN_FAILED';
        done(openError);
      }
    });
  });

  scannerReadInFlight.set(portPath, readPromise);
  return readPromise;
}

/**
 * launchScannerServer — starts the scanner WebSocket exe if not already running.
 */
function launchScannerServer(options = {}) {
  return launchScaleServer(options); // same logic, reuse
}

/**
 * listenScannerServer — connects to ws://127.0.0.1:8766 and waits for one
 * barcode push.  The scanner exe broadcasts the barcode string the moment a
 * scan occurs.  timeoutMs is how long to wait for the user to scan.
 */
function listenScannerServer(options = {}) {
  const {
    url = 'ws://127.0.0.1:8766',
    timeoutMs = 30000,
  } = options;

  return new Promise((resolve) => {
    let settled = false;
    let ws;

    const done = (err, payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { if (ws && ws.readyState <= 1) ws.close(); } catch (_) {}
      if (err) {
        resolve({ ok: false, code: err.code || 'SCANNER_ERROR', url, error: err.message || String(err) });
      } else {
        resolve(payload);
      }
    };

    const timer = setTimeout(() => {
      const e = new Error(`No barcode scanned within ${Math.round(timeoutMs / 1000)} seconds.`);
      e.code = 'SCANNER_TIMEOUT';
      done(e);
    }, timeoutMs);

    try {
      ws = new WebSocket(url);
    } catch (err) {
      err.code = 'SCANNER_WS_CREATE_FAILED';
      done(err);
      return;
    }

    ws.on('error', (err) => {
      const msg = String(err.message || err);
      const friendly = /ECONNREFUSED/i.test(msg)
        ? `Scanner server not running at ${url}. Click "Start Scanner" first.`
        : `Scanner WebSocket error: ${msg}`;
      const e = new Error(friendly);
      e.code = 'SCANNER_CONNECT_FAILED';
      done(e);
    });

    ws.on('message', (data) => {
      const text = String(data).trim();
      if (text) {
        done(null, {
          ok: true,
          url,
          barcode: text,
          capturedAt: new Date().toISOString(),
        });
      }
    });
  });
}

module.exports = {
  listPrinters,
  printText,
  listSerialPorts,
  readWeightOnce,
  readWeightFromScaleServer,
  launchScaleServer,
  launchScannerServer,
  listenScannerServer,
  readScannerOnce,
};
