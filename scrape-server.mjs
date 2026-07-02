/**
 * scrape-server.mjs
 *
 * Single HTTP server (port 3001) that replaces BusyBase entirely.
 * Stores properties in SQLite (one .db file per dataset).
 * Serves the Vite app's data API and triggers the Playwright scraper.
 *
 * Dataset management:
 *   GET  /datasets            — list all datasets
 *   POST /datasets            — create dataset { name, label? }
 *   GET  /datasets/active     — active dataset info
 *   POST /datasets/active     — switch active dataset { name }
 *   DELETE /datasets/:name    — delete a dataset
 *
 * Properties API (operates on active dataset):
 *   GET  /properties          — fetch all properties
 *   POST /properties          — upsert properties (array)
 *
 * Scraper control:
 *   POST /scrape              — start scraper with opts, saves to active dataset
 *   GET  /scrape/status       — scraper status + last log lines
 *
 * Images:
 *   GET  /images/:file        — serve local WebP thumbnails
 */

import http from 'http';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const PORT = 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(__dirname, 'images');
const DATASETS_DIR = path.join(__dirname, 'datasets');
const ACTIVE_FILE = path.join(DATASETS_DIR, '.active');

if (!fs.existsSync(DATASETS_DIR)) fs.mkdirSync(DATASETS_DIR, { recursive: true });

// ── Dataset helpers ────────────────────────────────────────────────────────────

function listDatasets() {
  return fs.readdirSync(DATASETS_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const name = f.replace(/\.db$/, '');
      const meta = loadMeta(name);
      const db = openDb(name);
      const count = db.prepare('SELECT COUNT(*) as n FROM properties').get().n;
      db.close();
      return { name, label: meta.label || name, count, created_at: meta.created_at };
    })
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
}

function getActiveName() {
  if (fs.existsSync(ACTIVE_FILE)) {
    const name = fs.readFileSync(ACTIVE_FILE, 'utf8').trim();
    if (name && fs.existsSync(path.join(DATASETS_DIR, `${name}.db`))) return name;
  }
  // Fall back to first dataset found
  const dbs = fs.readdirSync(DATASETS_DIR).filter(f => f.endsWith('.db'));
  if (dbs.length) {
    const name = dbs[0].replace(/\.db$/, '');
    setActive(name);
    return name;
  }
  return null;
}

function setActive(name) {
  fs.writeFileSync(ACTIVE_FILE, name, 'utf8');
}

function metaPath(name) {
  return path.join(DATASETS_DIR, `${name}.meta.json`);
}

function loadMeta(name) {
  try { return JSON.parse(fs.readFileSync(metaPath(name), 'utf8')); } catch { return {}; }
}

function saveMeta(name, meta) {
  fs.writeFileSync(metaPath(name), JSON.stringify(meta, null, 2), 'utf8');
}

function openDb(name) {
  const db = new Database(path.join(DATASETS_DIR, `${name}.db`));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      code TEXT PRIMARY KEY,
      url TEXT,
      tipo TEXT,
      bairro TEXT,
      cidade TEXT,
      endereco TEXT,
      preco_venda REAL,
      preco_original REAL,
      area_m2 REAL,
      quartos INTEGER,
      banheiros INTEGER,
      vagas INTEGER,
      lat REAL,
      lng REAL,
      image_url TEXT,
      local_image TEXT,
      tags TEXT DEFAULT '[]',
      features TEXT DEFAULT '[]',
      scraped_at TEXT
    )
  `);
  return db;
}

function createDataset(name, label) {
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error('Invalid dataset name');
  const db = openDb(name);
  db.close();
  saveMeta(name, { label: label || name, created_at: new Date().toISOString() });
  return name;
}

// ── Active DB cache (single open connection for active dataset) ───────────────

let _activeDb = null;
let _activeName = null;

function getDb() {
  const name = getActiveName();
  if (!name) throw new Error('No active dataset');
  if (_activeName !== name) {
    if (_activeDb) { try { _activeDb.close(); } catch {} }
    _activeDb = openDb(name);
    _activeName = name;
  }
  return _activeDb;
}

function switchDataset(name) {
  if (!fs.existsSync(path.join(DATASETS_DIR, `${name}.db`))) {
    throw new Error(`Dataset "${name}" not found`);
  }
  if (_activeDb) { try { _activeDb.close(); } catch {} _activeDb = null; }
  _activeName = null;
  setActive(name);
}

// ── Upsert helpers ────────────────────────────────────────────────────────────

const UPSERT_SQL = `
  INSERT INTO properties
    (code, url, tipo, bairro, cidade, endereco, preco_venda, preco_original,
     area_m2, quartos, banheiros, vagas, lat, lng, image_url, local_image,
     tags, features, scraped_at)
  VALUES
    (@code, @url, @tipo, @bairro, @cidade, @endereco, @preco_venda, @preco_original,
     @area_m2, @quartos, @banheiros, @vagas, @lat, @lng, @image_url, @local_image,
     @tags, @features, @scraped_at)
  ON CONFLICT(code) DO UPDATE SET
    url=excluded.url, tipo=excluded.tipo, bairro=excluded.bairro,
    cidade=excluded.cidade, endereco=excluded.endereco,
    preco_venda=excluded.preco_venda, preco_original=excluded.preco_original,
    area_m2=excluded.area_m2, quartos=excluded.quartos,
    banheiros=excluded.banheiros, vagas=excluded.vagas,
    lat=excluded.lat, lng=excluded.lng,
    image_url=excluded.image_url, local_image=excluded.local_image,
    tags=excluded.tags, features=excluded.features,
    scraped_at=excluded.scraped_at
`;

function upsertProperties(listings) {
  const db = getDb();
  const stmt = db.prepare(UPSERT_SQL);
  const many = db.transaction(rows => {
    for (const r of rows) stmt.run({
      code: r.code || null,
      url: r.url || null,
      tipo: r.tipo || null,
      bairro: r.bairro || null,
      cidade: r.cidade || null,
      endereco: r.endereco || null,
      preco_venda: r.preco_venda ?? null,
      preco_original: r.preco_original ?? null,
      area_m2: r.area_m2 ?? null,
      quartos: r.quartos ?? null,
      banheiros: r.banheiros ?? null,
      vagas: r.vagas ?? null,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      image_url: r.image_url || null,
      local_image: r.local_image || null,
      tags: Array.isArray(r.tags) ? JSON.stringify(r.tags) : (r.tags || '[]'),
      features: Array.isArray(r.features) ? JSON.stringify(r.features) : (r.features || '[]'),
      scraped_at: r.scraped_at || new Date().toISOString(),
    });
  });
  many(listings);
  return listings.length;
}

// ── Scraper process management ────────────────────────────────────────────────

let runningProcess = null;
let lastLog = [];
let lastExitCode = null;
let scrapeDataset = null; // which dataset is being scraped into

function startScraper(opts, targetDataset) {
  if (runningProcess) return false;

  const scriptArgs = [
    'scripts/scraper.js',
    `--busybaseUrl=http://localhost:${PORT}`,
    '--busybaseKey=local',
  ];
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
  lastExitCode = null;
  scrapeDataset = targetDataset;

  console.log('[scrape-server] Starting scraper:', scriptArgs.slice(1).join(' '));

  runningProcess = spawn('node', scriptArgs, {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BUSYBASE_URL: `http://localhost:${PORT}`, BUSYBASE_KEY: 'local' },
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
    lastExitCode = code;
    runningProcess = null;
    scrapeDataset = null;
  });

  return true;
}

// ── Seed logic ────────────────────────────────────────────────────────────────

function seedDefaultDataset() {
  // Check if any dataset has properties — if so, skip
  const datasets = listDatasets();
  if (datasets.some(d => d.count > 0)) {
    console.log(`[seed] Data already present (${datasets.map(d => `${d.name}:${d.count}`).join(', ')}). Skipping seed.`);
    return;
  }

  // Create default dataset if none exists
  const defaultName = 'campeche-3q';
  if (!fs.existsSync(path.join(DATASETS_DIR, `${defaultName}.db`))) {
    createDataset(defaultName, 'Campeche 3+ quartos');
    console.log(`[seed] Created dataset: ${defaultName}`);
  }
  setActive(defaultName);

  console.log('[seed] No data found — seeding Campeche 3+ quartos (2 pages)...');
  startScraper({
    transacao: 'comprar',
    categoria: 'residencial',
    cidade: 'sc+florianopolis',
    bairro: ['Campeche'],
    quartos: '3',
    maxPages: 2,
  }, defaultName);
}

// ── HTTP request body parser ──────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function send(res, status, data) {
  res.writeHead(status, CORS_HEADERS);
  res.end(JSON.stringify(data));
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization, Prefer',
  'Content-Type': 'application/json',
};

// ── Router ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  const url = req.url.split('?')[0];
  const method = req.method;

  // Images
  if (method === 'GET' && url.startsWith('/images/')) {
    const filename = path.basename(url);
    const filepath = path.join(IMAGES_DIR, filename);
    if (!filename.endsWith('.webp') || !fs.existsSync(filepath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    });
    return fs.createReadStream(filepath).pipe(res);
  }

  // ── Datasets ──
  if (method === 'GET' && url === '/datasets') {
    return send(res, 200, listDatasets());
  }

  if (method === 'POST' && url === '/datasets') {
    const body = await readBody(req).catch(() => ({}));
    const name = (body.name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!name) return send(res, 400, { error: 'name required' });
    try {
      createDataset(name, body.label);
      return send(res, 201, { name, label: body.label || name });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }

  if (method === 'GET' && url === '/datasets/active') {
    const name = getActiveName();
    if (!name) return send(res, 404, { error: 'No active dataset' });
    const meta = loadMeta(name);
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) as n FROM properties').get().n;
    return send(res, 200, { name, label: meta.label || name, count });
  }

  if (method === 'POST' && url === '/datasets/active') {
    const body = await readBody(req).catch(() => ({}));
    try {
      switchDataset(body.name);
      return send(res, 200, { active: body.name });
    } catch (e) {
      return send(res, 404, { error: e.message });
    }
  }

  const datasetDeleteMatch = url.match(/^\/datasets\/([^/]+)$/);
  if (method === 'DELETE' && datasetDeleteMatch) {
    const name = datasetDeleteMatch[1];
    const dbFile = path.join(DATASETS_DIR, `${name}.db`);
    if (!fs.existsSync(dbFile)) return send(res, 404, { error: 'Not found' });
    if (_activeName === name) { try { _activeDb?.close(); } catch {} _activeDb = null; _activeName = null; }
    fs.rmSync(dbFile, { force: true });
    const mf = metaPath(name);
    if (fs.existsSync(mf)) fs.rmSync(mf);
    if (getActiveName() === name) fs.rmSync(ACTIVE_FILE, { force: true });
    return send(res, 200, { deleted: name });
  }

  // ── Properties (BusyBase-compatible endpoints the scraper already calls) ──
  // GET /rest/v1/properties  or  GET /properties
  if (method === 'GET' && (url === '/properties' || url === '/rest/v1/properties')) {
    try {
      const parseJsonField = v => {
        try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p : JSON.parse(p); }
        catch { return []; }
      };
      const rows = getDb().prepare('SELECT * FROM properties').all().map(r => ({
        ...r,
        tags: parseJsonField(r.tags),
        features: parseJsonField(r.features),
      }));
      return send(res, 200, rows);
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  // POST /rest/v1/properties  or  POST /properties  — upsert
  if (method === 'POST' && (url === '/properties' || url === '/rest/v1/properties')) {
    const body = await readBody(req).catch(() => null);
    if (!body) return send(res, 400, { error: 'Invalid JSON' });
    const listings = Array.isArray(body) ? body : [body];
    try {
      upsertProperties(listings);
      return send(res, 200, { inserted: listings.length });
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  // ── Scraper control ──
  if (method === 'GET' && url === '/scrape/status') {
    return send(res, 200, {
      running: !!runningProcess,
      dataset: scrapeDataset,
      log: lastLog.slice(-30),
      exitCode: lastExitCode,
    });
  }

  if (method === 'POST' && url === '/scrape') {
    if (runningProcess) return send(res, 409, { error: 'Scraper already running' });
    const body = await readBody(req).catch(() => ({}));

    // If a dataset name is provided, create it if needed and switch to it
    let targetDataset = getActiveName();
    if (body.dataset) {
      const dname = body.dataset.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (!fs.existsSync(path.join(DATASETS_DIR, `${dname}.db`))) {
        createDataset(dname, body.datasetLabel || dname);
      }
      switchDataset(dname);
      targetDataset = dname;
    }

    const started = startScraper(body, targetDataset);
    return send(res, started ? 200 : 409, started ? { started: true, dataset: targetDataset } : { error: 'Already running' });
  }

  // Scraper runtime compatibility: BusyBase scraper_runs table (no-op, we ignore it)
  if (url === '/rest/v1/scraper_runs') {
    return send(res, 200, []);
  }

  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[scrape-server] Listening on http://localhost:${PORT}`);

  if (process.argv.includes('--seed')) {
    console.log('[scrape-server] --seed flag detected...');
    seedDefaultDataset();
  }
});
