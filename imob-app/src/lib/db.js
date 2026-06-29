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
  // Probe the REST API to confirm BusyBase is up
  await bbFetch('/properties?limit=1');
}

export async function getProperties(filters = {}) {
  const params = new URLSearchParams();
  params.set('order', 'preco_venda.asc');
  params.set('limit', '1000');

  if (filters.bairro?.length) {
    params.set(`in.bairro`, filters.bairro.join(','));
  }
  if (filters.quartos) {
    params.set(`gte.quartos`, parseInt(filters.quartos));
  }
  if (filters.tipoImovel?.length) {
    params.set(`in.tipo`, filters.tipoImovel.join(','));
  }
  if (filters.precoMin) {
    params.set(`gte.preco_venda`, parseFloat(filters.precoMin));
  }
  if (filters.precoMax) {
    params.set(`lte.preco_venda`, parseFloat(filters.precoMax));
  }
  if (filters.vagas !== null && filters.vagas !== undefined && filters.vagas !== '') {
    if (filters.vagas === '0') {
      params.set('eq.vagas', '0');
    } else {
      params.set(`gte.vagas`, parseInt(filters.vagas));
    }
  }
  if (filters.banheiros) {
    params.set(`gte.banheiros`, parseInt(filters.banheiros));
  }
  if (filters.areaMin) {
    params.set(`gte.area_m2`, parseFloat(filters.areaMin));
  }
  if (filters.areaMax) {
    params.set(`lte.area_m2`, parseFloat(filters.areaMax));
  }

  let result = await bbFetch(`/properties?${params.toString()}`);
  if (!Array.isArray(result)) result = [];

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
  if (filters.mobiliado) {
    result = result.filter(p => JSON.parse(p.tags || '[]').includes('mobiliado'));
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

export async function getStats() {
  const data = await bbFetch('/properties?limit=10000');
  if (!Array.isArray(data) || !data.length) return null;

  const prices = data.map(p => p.preco_venda).filter(Boolean);
  const bairros = [...new Set(data.map(p => p.bairro).filter(Boolean))];
  const tipos = [...new Set(data.map(p => p.tipo).filter(Boolean))];

  return {
    total: data.length,
    avgPrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    bairros,
    tipos,
  };
}
