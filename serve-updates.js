'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');

const DIST_DIR = path.join(__dirname, 'dist');
const PORT = Number(process.env.UPDATE_PORT || 8080);
const HOST = process.env.UPDATE_HOST || '0.0.0.0';

const MIME_TYPES = {
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.exe': 'application/octet-stream',
  '.blockmap': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
};

function send(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function safeResolve(requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const normalized = decoded === '/' ? '/latest.yml' : decoded;
  const targetPath = path.resolve(DIST_DIR, `.${normalized}`);
  if (!targetPath.startsWith(path.resolve(DIST_DIR))) {
    return null;
  }
  return targetPath;
}

const server = http.createServer((req, res) => {
  if (!fs.existsSync(DIST_DIR)) {
    send(res, 500, `dist directory not found: ${DIST_DIR}`);
    return;
  }

  if (req.url === '/health') {
    send(res, 200, 'ok');
    return;
  }

  const targetPath = safeResolve(req.url || '/');
  if (!targetPath) {
    send(res, 400, 'Invalid path');
    return;
  }

  fs.stat(targetPath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      send(res, 404, `Not found: ${req.url}`);
      return;
    }

    const ext = path.extname(targetPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });

    const stream = fs.createReadStream(targetPath);
    stream.on('error', (streamErr) => {
      send(res, 500, `Read error: ${streamErr.message}`);
    });
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[update-server] Serving ${DIST_DIR}`);
  console.log(`[update-server] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[update-server] Also reachable at http://192.168.1.92:${PORT} (if firewall allows)`);
  console.log('[update-server] Default route serves latest.yml, /health returns ok');
});

server.on('error', (err) => {
  console.error('[update-server] Failed to start:', err.message);
  process.exit(1);
});
