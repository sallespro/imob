import { createClient } from '@supabase/supabase-js';

const BUSYBASE_URL = import.meta.env.VITE_BUSYBASE_URL || 'http://localhost:54321';
const BUSYBASE_KEY = import.meta.env.VITE_BUSYBASE_KEY || 'local';

export const db = createClient(BUSYBASE_URL, BUSYBASE_KEY);

const bbHeaders = {
  'Content-Type': 'application/json',
  'apikey': BUSYBASE_KEY,
  'Authorization': `Bearer ${BUSYBASE_KEY}`,
};

async function bbFetch(path, options = {}) {
  const res = await fetch(`${BUSYBASE_URL}/rest/v1${path}`, {
    ...options,
    headers: { ...bbHeaders, ...options.headers },
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.data ?? json;
}

let authInitialized = false;

export async function initAuth() {
  if (authInitialized) return;
  authInitialized = true;
  await bbFetch('/properties?limit=1');
}

// Load ALL properties from DB, then filter client-side.
// This avoids BusyBase's string-based numeric comparison bugs.
export async function getProperties(filters = {}) {
  // Fetch everything (BusyBase has a patched limit of 100000)
  let result = await bbFetch('/properties?limit=100000');
  if (!Array.isArray(result)) result = [];

  // Client-side filtering
  return applyViewFilters(result, filters);
}

export function applyViewFilters(data, filters = {}) {
  let result = [...data];

  if (filters.bairro?.length) {
    const bairrosLower = filters.bairro.map(b => b.toLowerCase());
    result = result.filter(p => bairrosLower.includes((p.bairro || '').toLowerCase()));
  }
  if (filters.quartos) {
    const min = parseInt(filters.quartos);
    result = result.filter(p => (p.quartos || 0) >= min);
  }
  if (filters.tipoImovel?.length) {
    const typesLower = filters.tipoImovel.map(t => t.toLowerCase());
    result = result.filter(p => typesLower.includes((p.tipo || '').toLowerCase()));
  }
  if (filters.precoMin) {
    const min = parseFloat(filters.precoMin);
    result = result.filter(p => (p.preco_venda || 0) >= min);
  }
  if (filters.precoMax) {
    const max = parseFloat(filters.precoMax);
    result = result.filter(p => (p.preco_venda || 0) <= max);
  }
  if (filters.vagas !== null && filters.vagas !== undefined && filters.vagas !== '') {
    const min = parseInt(filters.vagas);
    result = result.filter(p => (p.vagas || 0) >= min);
  }
  if (filters.banheiros) {
    const min = parseInt(filters.banheiros);
    result = result.filter(p => (p.banheiros || 0) >= min);
  }
  if (filters.areaMin) {
    const min = parseFloat(filters.areaMin);
    result = result.filter(p => (p.area_m2 || 0) >= min);
  }
  if (filters.areaMax) {
    const max = parseFloat(filters.areaMax);
    result = result.filter(p => (p.area_m2 || 0) <= max);
  }
  if (filters.comodidades?.length) {
    result = result.filter(p => {
      const feats = JSON.parse(p.features || '[]').map(f => f.toLowerCase());
      return filters.comodidades.every(c => feats.some(f => f.includes(c.toLowerCase())));
    });
  }
  if (filters.tags?.length) {
    result = result.filter(p => {
      const tags = JSON.parse(p.tags || '[]');
      return filters.tags.some(t => tags.includes(t));
    });
  }
  if (filters.exclusivo) {
    result = result.filter(p => JSON.parse(p.tags || '[]').includes('exclusivo'));
  }
  if (filters.mobiliado === 'Sim') {
    result = result.filter(p => JSON.parse(p.tags || '[]').includes('mobiliado'));
  } else if (filters.mobiliado === 'Semi') {
    result = result.filter(p => JSON.parse(p.tags || '[]').includes('semi-mobiliado'));
  }

  return result;
}

export async function getScraperRuns() {
  try {
    const data = await bbFetch('/scraper_runs?order=ran_at.desc&limit=20');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function upsertProperties(listings) {
  for (let i = 0; i < listings.length; i += 50) {
    await bbFetch('/properties', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(listings.slice(i, i + 50)),
    });
  }
}

export async function insertScraperRun({ filters, total_found }) {
  await bbFetch('/scraper_runs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ filters, total_found, ran_at: new Date().toISOString() }),
  });
}
