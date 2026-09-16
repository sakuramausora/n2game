/* serve.js — local HTTP server for the N2 game.
   Serves the static game files and proxies story generation to an opencode server:
     GET  /api/health  -> { healthy, version, url, reason }
     POST /api/story   -> { ok, story, raw?, error? }  (body: { words: [{w,r,pl,m}] })

   Usage:
     node serve.js                    # http://localhost:8000

   If neither OPENCODE_SERVER_URL nor OPENCODE_SERVER_PASSWORD is set, serve.js
   auto-starts its own `opencode serve` process (CLI on PATH, or npx opencode-ai).

   Env:
     PORT                     (default 8000)
     OPENCODE_SERVER_URL      (default http://127.0.0.1:4096 when password set)
     OPENCODE_SERVER_USERNAME (default "opencode")
     OPENCODE_SERVER_PASSWORD (default "") — set to connect to an existing server
     OPENCODE_PATH            path to the opencode CLI (or a .js launcher script) */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const os = require('os');
const cp = require('child_process');
const { buildPrompt, parseStory } = require('./storyllm.js');

const ROOT = __dirname;
const PORT = +(process.env.PORT || 8000);
const EXPLICIT_URL = !!process.env.OPENCODE_SERVER_URL;
let OC_URL = (process.env.OPENCODE_SERVER_URL || 'http://127.0.0.1:4096').replace(/\/+$/, '');
const OC_USER = process.env.OPENCODE_SERVER_USERNAME || 'opencode';
let OC_PASS = process.env.OPENCODE_SERVER_PASSWORD || '';
let backendProc = null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function authHeader() {
  return 'Basic ' + Buffer.from(OC_USER + ':' + OC_PASS, 'utf8').toString('base64');
}

// ---- auto-start of `opencode serve` (only when no explicit server was configured) ----

function freePort() {
  return new Promise(function (resolve, reject) {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', function () {
      const p = s.address().port;
      s.close(function () { resolve(p); });
    });
  });
}

function probeLauncher(cand) {
  return new Promise(function (resolve) {
    let out = '';
    let child;
    try {
      child = cp.spawn(cand.cmd, cand.versionArgs, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, shell: cand.shell });
    } catch (e) { resolve(false); return; }
    const t = setTimeout(function () { try { child.kill(); } catch (e) {} resolve(false); }, 180000);
    child.stdout.on('data', function (d) { out += d; });
    child.on('error', function () { clearTimeout(t); resolve(false); });
    child.on('close', function (code) {
      clearTimeout(t);
      resolve(code === 0 && out.trim().length > 0);
    });
  });
}

function launchers() {
  const list = [];
  const p = process.env.OPENCODE_PATH;
  if (p) {
    if (/\.js$/i.test(p)) list.push({ cmd: 'node', versionArgs: [p, '--version'], runArgs: [p, 'serve'], shell: false });
    else list.push({ cmd: p, versionArgs: ['--version'], runArgs: ['serve'], shell: true });
  }
  list.push({ cmd: 'opencode', versionArgs: ['--version'], runArgs: ['serve'], shell: true });
  list.push({ cmd: 'npx', versionArgs: ['-y', 'opencode-ai', '--version'], runArgs: ['-y', 'opencode-ai', 'serve'], shell: true });
  list.push({ cmd: 'bunx', versionArgs: ['opencode-ai', '--version'], runArgs: ['opencode-ai', 'serve'], shell: true });
  return list;
}

function probeBackend(base, pass, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(function () { ctl.abort(); }, timeoutMs || 15000);
  const attempt = function () {
    return fetch(base + '/global/health', {
      headers: { authorization: 'Basic ' + Buffer.from(OC_USER + ':' + pass).toString('base64') },
      signal: ctl.signal
    }).then(function (r) { return r.status === 200; })
      .catch(function () {
        if (!ctl.signal.aborted) return new Promise(function (res) { setTimeout(function () { res(attempt()); }, 600); });
        return false;
      });
  };
  return attempt().finally(function () { clearTimeout(timer); });
}

// Start our own opencode serve (random password, free port). Returns info object.
async function startBackend() {
  // OPENCODE_SERVER_PASSWORD bywa dziedziczone z sesji opencode (bez URL-a).
  // Zamiast od razu ufać domyślnemu adresowi, sprawdzamy, czy serwer tam naprawdę
  // odpowiada. Jeśli nie — uruchamiamy własny backend (jak przy braku hasła).
  if (OC_PASS) {
    const ok = await probeBackend(OC_URL, OC_PASS, 10000);
    if (ok) {
      return {
        spawned: false,
        reason: EXPLICIT_URL
          ? 'użycie skonfigurowanego serwera (' + OC_URL + ' — OK)'
          : 'użycie istniejącego serwera (OPENCODE_SERVER_PASSWORD — odpowiada)'
      };
    }
    if (EXPLICIT_URL) {
      return { spawned: false, reason: 'skonfigurowany OPENCODE_SERVER_URL nie odpowiada: ' + OC_URL };
    }
    OC_PASS = '';
  }
  const port = await freePort();
  const pass = crypto.randomBytes(12).toString('hex');
  const base = 'http://127.0.0.1:' + port;
  for (const cand of launchers()) {
    const found = await probeLauncher(cand);
    if (!found) continue;
    const args = cand.runArgs.concat(['--hostname', '127.0.0.1', '--port', String(port)]);
    const child = cp.spawn(cand.cmd, args, {
      env: Object.assign({}, process.env, {
        OPENCODE_SERVER_USERNAME: OC_USER,
        OPENCODE_SERVER_PASSWORD: pass,
        XDG_STATE_HOME: path.join(os.tmpdir(), 'n2-opencode-state')
      }),
      stdio: 'ignore',
      windowsHide: true,
      shell: cand.shell
    });
    child.on('error', function () {});
    child.on('exit', function () {
      const was = backendProc;
      if (was === child) backendProc = null;
    });
    const ready = await probeBackend(base, pass, 90000);
    if (!ready) {
      try { cp.spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']); } catch (e) { try { child.kill(); } catch (e2) {} }
      continue;
    }
    backendProc = child;
    OC_URL = base;
    OC_PASS = pass;
    return { spawned: true, base: base, launcher: cand.cmd, pid: child.pid };
  }
  return { spawned: false, reason: 'nie znaleziono polecenia opencode (opencode, npx opencode-ai, bunx opencode-ai)' };
}

function stopBackend() {
  if (backendProc) {
    try { cp.spawnSync('taskkill', ['/pid', String(backendProc.pid), '/T', '/F']); } catch (e) { try { backendProc.kill(); } catch (e2) {} }
    backendProc = null;
  }
}

function cleanupAndExit() {
  stopBackend();
  process.exit(0);
}
process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);

async function ocFetch(urlPath, opts) {
  opts = opts || {};
  const ctl = new AbortController();
  const timer = setTimeout(function () { ctl.abort(); }, opts.timeout || 120000);
  try {
    const res = await fetch(OC_URL + urlPath, {
      method: opts.method || 'GET',
      headers: {
        'content-type': 'application/json',
        authorization: authHeader()
      },
      body: opts.body,
      signal: ctl.signal
    });
    const json = await res.json().catch(function () { return null; });
    return { status: res.status, json: json };
  } finally {
    clearTimeout(timer);
  }
}

async function checkHealth() {
  try {
    const r = await ocFetch('/global/health');
    if (r.status === 200 && r.json && r.json.healthy) {
      return { healthy: true, version: r.json.version, url: OC_URL };
    }
    if (r.status === 401) {
      return { healthy: false, status: 401, url: OC_URL, reason: 'Brak autoryzacji w serwerze opencode — sprawdź OPENCODE_SERVER_PASSWORD / OPENCODE_SERVER_USERNAME.' };
    }
    return { healthy: false, status: r.status, url: OC_URL, reason: 'Serwer opencode zwrócił status ' + r.status + '.' };
  } catch (e) {
    return { healthy: false, url: OC_URL, reason: 'Nie mogę połączyć się z ' + OC_URL + ' — uruchom „opencode serve”, a potem włącz ' + ROOT.replace(/\\/g, '/') + '/serve.js.' };
  }
}

async function handleStory(req, res, bodyText) {
  let words = [];
  let genre = 'normal';
  try {
    const b = JSON.parse(bodyText);
    words = (b && Array.isArray(b.words)) ? b.words : [];
    if (b && typeof b.genre === 'string' && b.genre) genre = b.genre;
  } catch (e) { /* ignore */ }
  if (!words.length) return send(res, { ok: false, error: 'Brak słówek w żądaniu (/api/story).' });
  const clean = words.map(function (w) {
    return { w: String(w.w || ''), r: String(w.r || ''), pl: String(w.pl || ''), m: String(w.m || '') };
  });
  const prompt = buildPrompt(clean, genre);
  try {
    const sess = await ocFetch('/session', { method: 'POST', body: JSON.stringify({}), timeout: 30000 });
    if (sess.status !== 200 || !sess.json || !sess.json.id) {
      const reason = sess.status === 401
        ? 'Brak autoryzacji w serwerze opencode — sprawdź OPENCODE_SERVER_PASSWORD.'
        : 'Nie udało się utworzyć sesji opencode (status ' + sess.status + ').';
      return send(res, { ok: false, error: reason, status: sess.status });
    }
    const sid = sess.json.id;
    const msg = await ocFetch('/session/' + encodeURIComponent(sid) + '/message', {
      method: 'POST',
      body: JSON.stringify({ parts: [{ type: 'text', text: prompt }] }),
      timeout: 600000
    });
    if (msg.status !== 200 || !msg.json) {
      const reason = msg.status === 401
        ? 'Brak autoryzacji w serwerze opencode — sprawdź OPENCODE_SERVER_PASSWORD.'
        : 'Wiadomość nie została przetworzona przez opencode (status ' + msg.status + ').';
      return send(res, { ok: false, error: reason, status: msg.status });
    }
    const raw = (msg.json.parts || [])
      .filter(function (p) { return p && p.type === 'text' && p.text; })
      .map(function (p) { return p.text; })
      .join('\n');
    const story = parseStory(raw, clean);
    if (story) story.genre = genre;
    return send(res, story
      ? { ok: true, story: story, model: (msg.json.info && msg.json.info.model) || null }
      : { ok: true, story: null, raw: String(raw || '').slice(0, 4000) });
  } catch (e) {
    const msg2 = (e && e.message) ? e.message : String(e);
    const out = /abort/i.test(msg2)
      ? 'Generowanie historyjki trwało zbyt długo (> 10 min) — spróbuj ponownie krótszą partią lub innym gatunkiem. (' + msg2 + ')'
      : 'Błąd połączenia z serwerem opencode: ' + msg2;
    return send(res, { ok: false, error: out });
  }
}

function send(res, obj, status) {
  const body = JSON.stringify(obj);
  res.writeHead(status || 200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function rootFile(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch (e) { return null; }
  if (p === '/' || p === '') p = '/index.html';
  const abs = path.resolve(ROOT, '.' + p);
  const rootRes = path.resolve(ROOT);
  if (abs !== rootRes && abs.indexOf(rootRes + path.sep) !== 0) return null;
  return abs;
}

function serveStatic(urlPath, res) {
  const abs = rootFile(urlPath);
  if (!abs) return send(res, { ok: false, error: 'Not found' }, 404);
  fs.stat(abs, function (err, st) {
    if (err || !st.isFile()) return send(res, { ok: false, error: 'Not found' }, 404);
    res.writeHead(200, {
      'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'content-length': st.size
    });
    fs.createReadStream(abs).pipe(res);
  });
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

function createServer() {
  return http.createServer(function (req, res) {
    const url = (req.url || '/').split('?')[0];
    if (req.method === 'GET' && url === '/api/health') {
      checkHealth().then(function (h) { send(res, h); }, function (e) { send(res, { healthy: false, reason: String(e && e.message || e) }); });
      return;
    }
    if (req.method === 'POST' && url === '/api/story') {
      readBody(req).then(function (body) {
        handleStory(req, res, body);
      }, function (e) {
        send(res, { ok: false, error: 'Nie udało się odczytać żądania: ' + (e && e.message || e) });
      });
      return;
    }
    serveStatic(req.url || '/', res);
  });
}

if (require.main === module) {
  createServer().listen(PORT, function () {
    const addr = this.address();
    console.log('N2 game server: http://localhost:' + addr.port);
    console.log('opencode: szukam serwera opencode (pierwszy start przez npx może chwilę pobierać pakiet)…');
    startBackend().then(function (info) {
      if (info.spawned) {
        console.log('opencode: uruchomiono automatycznie (' + info.launcher + ', pid ' + info.pid + ') na ' + info.base);
      } else {
        console.log('opencode: ' + info.reason);
      }
      checkHealth().then(function (h) {
        console.log('opencode: ' + (h.healthy ? ('OK (v' + h.version + ')') : 'NIEDOSTĘPNY — ' + h.reason));
      });
    });
  });
}

module.exports = { createServer: createServer, rootFile: rootFile, checkHealth: checkHealth, startBackend: startBackend, stopBackend: stopBackend }; // eslint-disable-line no-undef