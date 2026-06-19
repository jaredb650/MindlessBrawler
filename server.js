// Mindless Brawler dev server — serves the game + the sprite tool, and saves sprite config / uploads.
// Run:  node server.js        (then open http://localhost:8000  ·  tool: /tools/sprite-tool.html)
// Zero dependencies. Replaces `python3 -m http.server` (stop that first, or set PORT=8001).
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, PORT = process.env.PORT || 8000;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
  res.end(body);
}
function readBody(req, cb) { let b = ''; req.on('data', c => { b += c; if (b.length > 80e6) req.destroy(); }); req.on('end', () => cb(b)); }

http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);

  // ── API: liveness probe (the tool checks this to know save/upload are available) ──
  if (req.method === 'GET' && u === '/api/ping') return send(res, 200, '{"ok":true}', 'application/json');

  // ── API: save the whole sprite config (the tool POSTs the full sprites.json) ──
  if (req.method === 'POST' && u === '/api/sprites') {
    return readBody(req, body => {
      try {
        JSON.parse(body);   // validate before writing
        fs.writeFileSync(path.join(ROOT, 'assets/sprites/sprites.json'), body);
        send(res, 200, '{"ok":true}', 'application/json');
      } catch (e) { send(res, 400, JSON.stringify({ ok: false, error: String(e) }), 'application/json'); }
    });
  }

  // ── API: upload a sprite sheet PNG → assets/sprites/<char>/<name> ──  body: {char,name,dataUrl}
  if (req.method === 'POST' && u === '/api/upload') {
    return readBody(req, body => {
      try {
        const { char, name, dataUrl } = JSON.parse(body);
        const ch = String(char).replace(/[^a-z0-9]/gi, '');
        const safe = String(name).replace(/[^a-zA-Z0-9_.-]/g, '_') || 'sheet.png';
        const dir = path.join(ROOT, 'assets/sprites', ch); fs.mkdirSync(dir, { recursive: true });
        const rel = `assets/sprites/${ch}/${safe}`;
        fs.writeFileSync(path.join(ROOT, rel), Buffer.from((dataUrl.split(',')[1] || ''), 'base64'));
        send(res, 200, JSON.stringify({ ok: true, src: rel }), 'application/json');
      } catch (e) { send(res, 400, JSON.stringify({ ok: false, error: String(e) }), 'application/json'); }
    });
  }

  // ── static files ──
  const fp = path.join(ROOT, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
  if (!fp.startsWith(ROOT)) return send(res, 403, 'forbidden');                    // no path traversal
  fs.readFile(fp, (err, data) => err ? send(res, 404, 'not found') : send(res, 200, data, MIME[path.extname(fp)] || 'application/octet-stream'));
}).listen(PORT, () => console.log(`\n  Mindless Brawler  →  http://localhost:${PORT}\n  Sprite tool       →  http://localhost:${PORT}/tools/sprite-tool.html\n`));
