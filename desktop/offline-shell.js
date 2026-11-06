// Serves the packaged web client under the POS server's own origin so the terminal
// boots with no link at all.
//
// The origin is what makes this work: offline credentials, the selected company and
// the cached product/customer tables live in IndexedDB and localStorage keyed to
// https://fiscalstack.co.zw. Any other origin (file://, a custom scheme, localhost)
// sees empty storage and renders a login form that cannot authenticate. Intercepting
// `https` for that one host keeps the origin — and therefore the offline data — intact.
const { net, protocol } = require('electron');
const log = require('electron-log');
const path = require('path');
const fs = require('fs');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// Paths the bundle can never answer — these always belong to the live server.
const SERVER_PREFIXES = ['/api', '/auth', '/uploads', '/health', '/metrics', '/api-docs'];

// net.fetch() for a scheme we handle re-enters this handler, which loops until the
// process dies. Every passthrough has to bypass our own interception.
const BYPASS = { bypassCustomProtocolHandlers: true };

// How long the app shell waits on the server before opening the bundled client.
// Short enough that a dead link still boots, long enough for a slow but live one.
const UI_DEADLINE_MS = 6000;

let bundleDir = null;
let shellOrigin = null;
let servingLocal = false;
let registered = false;

function isUnderBundle(file) {
  return file === bundleDir || file.startsWith(bundleDir + path.sep);
}

function isServerPath(pathname) {
  return SERVER_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

function hasExtension(pathname) {
  return /\.[a-z0-9]{1,8}$/i.test(pathname);
}

function contentType(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function respond(body, status, headers) {
  return new Response(body, { status, headers });
}

function fromBundle(pathname) {
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes('\0') || decoded.includes('..')) {
    return respond('Bad path', 400, { 'content-type': 'text/plain; charset=utf-8' });
  }

  const rel = decoded.replace(/^\/+/, '') || 'index.html';
  const candidate = path.join(bundleDir, rel);
  const target = hasExtension(candidate) ? candidate : path.join(candidate, 'index.html');

  if (!isUnderBundle(target) || !fs.existsSync(target)) {
    // Hashed asset names change with every build, so a miss is the usual symptom of a
    // stale bundle — say so rather than silently serving the app shell for it.
    if (hasExtension(decoded)) {
      return respond(`Bundled asset missing: ${decoded}`, 404, { 'content-type': 'text/plain; charset=utf-8' });
    }
    const shell = path.join(bundleDir, 'index.html');
    if (!fs.existsSync(shell)) {
      return respond('No bundled client', 503, { 'content-type': 'text/plain; charset=utf-8' });
    }
    return respond(fs.readFileSync(shell), 200, {
      'content-type': contentType(shell),
      'cache-control': 'no-cache',
    });
  }

  const immutable = decoded.startsWith('/assets/');
  return respond(fs.readFileSync(target), 200, {
    'content-type': contentType(target),
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
}

async function passthrough(request, timeoutMs) {
  if (!timeoutMs) return net.fetch(request, BYPASS);
  // Passing a signal alongside the Request replaces its own, so aborting here also
  // cancels the upstream fetch instead of leaving it running.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await net.fetch(request, { ...BYPASS, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function handler(request) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return passthrough(request);
  }

  if (`${url.protocol}//${url.host}` !== shellOrigin || isServerPath(url.pathname)) {
    return passthrough(request);
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return passthrough(request);
  }

  if (!servingLocal) {
    try {
      // A stalled link never rejects, so the deadline is what turns a terminal that
      // hangs on a spinner into one that opens the offline POS.
      return await passthrough(request, UI_DEADLINE_MS);
    } catch (err) {
      const reason = err && err.name === 'AbortError'
        ? `no answer within ${UI_DEADLINE_MS}ms`
        : (err && err.message) || 'unreachable';
      // Any fallback commits the session to disk, so the next navigation is served
      // whole from the bundle instead of half live and half stale.
      servingLocal = true;
      log.warn(`[offline-shell] upstream ${url.pathname} failed (${reason}); serving bundled client`);
      return fromBundle(url.pathname);
    }
  }

  // servingLocal: assets come off disk at once, but a document request still tries
  // the server, so the next reload picks the live UI back up by itself.
  if (hasExtension(url.pathname)) return fromBundle(url.pathname);

  try {
    const response = await passthrough(request, UI_DEADLINE_MS);
    servingLocal = false;
    log.info('[offline-shell] server reachable again; resuming live client');
    return response;
  } catch {
    return fromBundle(url.pathname);
  }
}

/**
 * Installs the interception. Returns false when there is no usable bundled client,
 * in which case the app behaves exactly as it did without this module.
 */
function mount(rendererDir, origin) {
  bundleDir = path.resolve(rendererDir);
  shellOrigin = origin;

  if (!fs.existsSync(path.join(bundleDir, 'index.html'))) return false;
  if (registered) return true;

  protocol.handle(new URL(origin).protocol.replace(':', ''), handler);
  registered = true;
  return true;
}

module.exports = { mount };
