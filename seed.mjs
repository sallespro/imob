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
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BB_URL = process.env.BUSYBASE_URL || 'http://localhost:54321';
const BB_KEY = process.env.BUSYBASE_KEY || 'local';
const FORCE = process.argv.includes('--force');
const DATA_DIR = path.join(__dirname, 'busybase_data');

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
  try {
    const res = await fetch(`${BB_URL}/rest/v1/properties?select=code&limit=5`, {
      headers: { apikey: BB_KEY, Authorization: `Bearer ${BB_KEY}` },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    // If BusyBase returns an error object instead of array, table is corrupt
    if (!Array.isArray(data)) return 0;
    return data.length;
  } catch {
    return 0;
  }
}

function wipeLanceTables() {
  // Wipe Lance table directories directly — the only reliable way to avoid
  // Arrow schema fragmentation when scrape batches produce mixed-schema files.
  for (const table of ['properties.lance', 'scraper_runs.lance']) {
    const dir = path.join(DATA_DIR, table);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[seed] Wiped ${table}`);
    }
  }
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
  }

  // Always wipe Lance tables before seeding to prevent Arrow schema fragmentation.
  // Schema fragmentation (mixed old/new columns across Arrow fragments) causes
  // "Buffer is already detached" crashes in LanceDB when reading across fragments.
  wipeLanceTables();

  console.log('[seed] Seeding default dataset (Campeche, 3+ quartos)...');
  await runScraper(DEFAULT_PARAMS);
  console.log('[seed] Seed complete.');
}

main().catch(err => {
  console.error('[seed] Fatal:', err.message);
  process.exit(1);
});
