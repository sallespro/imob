/**
 * Tiny HTTP server that exposes POST /scrape to trigger the Playwright scraper.
 * Runs on port 3001 alongside Vite (5173) and BusyBase (54321).
 */
import http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const PORT = 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

let runningProcess = null;
let lastLog = [];

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/scrape/status') {
    res.writeHead(200, CORS_HEADERS);
    return res.end(JSON.stringify({ running: !!runningProcess, log: lastLog.slice(-20) }));
  }

  if (req.method === 'POST' && req.url === '/scrape') {
    if (runningProcess) {
      res.writeHead(409, CORS_HEADERS);
      return res.end(JSON.stringify({ error: 'Scraper already running' }));
    }

    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      let opts = {};
      try { opts = JSON.parse(body); } catch {}

      const scriptArgs = ['scripts/scraper.js'];
      if (opts.transacao) scriptArgs.push(`--transacao=${opts.transacao}`);
      if (opts.categoria) scriptArgs.push(`--categoria=${opts.categoria}`);
      if (opts.cidade) scriptArgs.push(`--cidade=${opts.cidade}`);
      if (opts.maxPages) scriptArgs.push(`--maxPages=${opts.maxPages}`);
      if (opts.quartos) scriptArgs.push(`--quartos=${opts.quartos}`);
      if (opts.precoMin) scriptArgs.push(`--precoMin=${opts.precoMin}`);
      if (opts.precoMax) scriptArgs.push(`--precoMax=${opts.precoMax}`);
      if (opts.vagas) scriptArgs.push(`--vagas=${opts.vagas}`);
      if (opts.banheiros) scriptArgs.push(`--banheiros=${opts.banheiros}`);
      if (opts.areaMin) scriptArgs.push(`--areaMin=${opts.areaMin}`);
      if (opts.areaMax) scriptArgs.push(`--areaMax=${opts.areaMax}`);
      for (const b of (opts.bairro || [])) scriptArgs.push(`--bairro=${b}`);
      for (const t of (opts.tipoImovel || [])) scriptArgs.push(`--tipoImovel=${t}`);

      lastLog = [];
      console.log('[scrape-server] Starting scraper with args:', scriptArgs.slice(1).join(' '));

      runningProcess = spawn('node', scriptArgs, {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      runningProcess.stdout.on('data', d => {
        const line = d.toString().trim();
        if (line) { console.log('[scraper]', line); lastLog.push(line); }
      });
      runningProcess.stderr.on('data', d => {
        const line = d.toString().trim();
        if (line) { console.error('[scraper]', line); lastLog.push('ERR: ' + line); }
      });
      runningProcess.on('close', code => {
        console.log('[scrape-server] Scraper exited with code', code);
        runningProcess = null;
      });

      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify({ started: true }));
    });
    return;
  }

  res.writeHead(404, CORS_HEADERS);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[scrape-server] Listening on http://localhost:${PORT}`);
});
