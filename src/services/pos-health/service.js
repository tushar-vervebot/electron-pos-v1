/**
 * POS Health Service
 * Runs as a Windows service via WinSW + Node.js.
 * Listens on localhost:5001 and exposes a JSON health endpoint.
 * Verify it works: http://localhost:5001/health
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const PORT     = 5001;
const LOG_DIR  = path.join('C:\\ProgramData', 'POS System', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'pos-health.log');

// ── Logging ───────────────────────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line);
  } catch (_) { /* non-fatal */ }
}

// ── Health data ───────────────────────────────────────────────────────────────
const startTime = new Date();

function healthPayload() {
  return JSON.stringify({
    service: 'POS_HealthService',
    status:  'running',
    version: '1.0.0',
    host:    os.hostname(),
    uptime:  Math.floor((Date.now() - startTime.getTime()) / 1000),
    started: startTime.toISOString(),
    pid:     process.pid,
    node:    process.version,
    memory:  process.memoryUsage(),
  }, null, 2);
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    const body = healthPayload();
    res.writeHead(200, {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
    log(`GET /health  ->  200  (uptime ${JSON.parse(body).uptime}s)`);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  log(`POS Health Service started on http://127.0.0.1:${PORT}/health`);
});

server.on('error', (err) => {
  log(`Server error: ${err.message}`);
  process.exit(1);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
['SIGTERM', 'SIGINT'].forEach((sig) =>
  process.on(sig, () => {
    log(`Received ${sig} – shutting down`);
    server.close(() => process.exit(0));
  })
);
