/**
 * seed.mjs — Bootstrap default dataset: Campeche, 3+ quartos, Florianópolis.
 *
 * Checks if properties already exist in BusyBase. If yes, exits 0 (no-op).
 * If no, clears any stale data and runs the scraper with default params.
 *
 * Usage: node seed.mjs [--force]
 *   --force  wipe DB and re-scrape even if data already exists
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BB_URL = process.env.BUSYBASE_URL || 'http://localhost:54321';
const BB_KEY = process.env.BUSYBASE_KEY || 'local';
const FORCE = process.argv.includes('--force');

const DEFAULT_PARAMS = {
  transacao: 'comprar',
  categoria: 'residencial',
  cidade: 'sc+florianopolis',
  bairro: ['Campeche'],
  quartos: '3',
};

async function waitForBusyBase(maxWaitMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${BB_URL}/rest/v1/properties?limit=1`, {
        headers: { apikey: BB_KEY, Authorization: `Bearer ${BB_KEY}` },
      });
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function countProperties() {
  const res = await fetch(`${BB_URL}/rest/v1/properties?select=code&limit=1`, {
    headers: { apikey: BB_KEY, Authorization: `Bearer ${BB_KEY}` },
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return Array.isArray(data) ? data.length : 0;
}

async function clearProperties() {
  // BusyBase/LanceDB delete-all: delete with a filter that matches everything
  // Use a high-limit fetch to get all codes then delete by code
  console.log('[seed] Clearing existing properties...');
  const res = await fetch(`${BB_URL}/rest/v1/properties?select=code&limit=100000`, {
    headers: { apikey: BB_KEY, Authorization: `Bearer ${BB_KEY}` },
  });
  if (!res.ok) return;
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length) return;

  const codes = rows.map(r => r.code).filter(Boolean);
  // Delete in batches using IN filter
  const batchSize = 200;
  for (let i = 0; i < codes.length; i += batchSize) {
    const batch = codes.slice(i, i + batchSize);
    const inClause = batch.map(c => `"${c}"`).join(',');
    await fetch(`${BB_URL}/rest/v1/properties?code=in.(${inClause})`, {
      method: 'DELETE',
      headers: { apikey: BB_KEY, Authorization: `Bearer ${BB_KEY}`, Prefer: 'return=minimal' },
    });
  }
  console.log(`[seed] Cleared ${codes.length} properties.`);
}

function runScraper(params) {
  return new Promise((resolve, reject) => {
    const args = ['scripts/scraper.js'];
    if (params.transacao) args.push(`--transacao=${params.transacao}`);
    if (params.categoria) args.push(`--categoria=${params.categoria}`);
    if (params.cidade) args.push(`--cidade=${params.cidade}`);
    if (params.quartos) args.push(`--quartos=${params.quartos}`);
    for (const b of (params.bairro || [])) args.push(`--bairro=${b}`);

    console.log('[seed] Running scraper:', args.slice(1).join(' '));

    const proc = spawn('node', args, {
      cwd: __dirname,
      stdio: 'inherit',
    });

    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Scraper exited with code ${code}`));
    });
  });
}

async function main() {
  console.log('[seed] Waiting for BusyBase...');
  const ready = await waitForBusyBase();
  if (!ready) {
    console.error('[seed] BusyBase not available after 30s — aborting.');
    process.exit(1);
  }

  if (!FORCE) {
    const count = await countProperties();
    if (count > 0) {
      console.log(`[seed] Dataset already present (${count}+ properties). Skipping seed.`);
      process.exit(0);
    }
  } else {
    await clearProperties();
  }

  console.log('[seed] No data found — seeding default dataset (Campeche, 3+ quartos)...');
  await runScraper(DEFAULT_PARAMS);
  console.log('[seed] Seed complete.');
}

main().catch(err => {
  console.error('[seed] Fatal:', err.message);
  process.exit(1);
});
