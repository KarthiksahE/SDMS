const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = process.env.PORT || 3000;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function resolveRoute(requestPath) {
  if (requestPath === '/' || requestPath === '') return '/index.html';
  if (requestPath === '/dashboard') return '/dashboard.html';
  if (requestPath === '/student-dashboard') return '/student-dashboard.html';
  return requestPath;
}

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    response.end(content);
  });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  let pathname = resolveRoute(requestUrl.pathname);
  pathname = decodeURIComponent(pathname);

  const filePath = path.join(root, pathname);

  if (!filePath.startsWith(root)) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isDirectory()) {
      sendFile(response, path.join(filePath, 'index.html'));
      return;
    }

    if (!error || pathname.endsWith('.html') || pathname.endsWith('.css') || pathname.endsWith('.js') || pathname.endsWith('.json') || pathname.endsWith('.png') || pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') || pathname.endsWith('.webp') || pathname.endsWith('.svg') || pathname.endsWith('.ico')) {
      sendFile(response, filePath);
      return;
    }

    sendFile(response, path.join(root, 'index.html'));
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`Port ${port} is already in use.`);
    console.log(`Frontend may already be running at http://localhost:${port}`);
    process.exit(0);
  }

  throw error;
});

server.listen(Number(port), () => {
  console.log(`Frontend server running on http://localhost:${port}`);
});