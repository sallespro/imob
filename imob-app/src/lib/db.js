import { createClient } from '@supabase/supabase-js';

const BUSYBASE_URL = import.meta.env.VITE_BUSYBASE_URL || 'http://localhost:54321';
const BUSYBASE_KEY = import.meta.env.VITE_BUSYBASE_KEY || 'local';

export const db = createClient(BUSYBASE_URL, BUSYBASE_KEY);

let authInitialized = false;

export async function initAuth() {
  if (authInitialized) return;
  authInitialized = true;
  try {
    await db.auth.signInAnonymously();
  } catch {
    try {
      await db.auth.keypair?.signIn();
    } catch {
      // proceed without auth
    }
  }
}

export async function getProperties(filters = {}) {
  let query = db.from('properties').select('*');

  if (filters.bairro?.length) {
    query = query.in('bairro', filters.bairro);
  }
  if (filters.quartos) {
    query = query.gte('quartos', parseInt(filters.quartos));
  }
  if (filters.tipoImovel?.length) {
    query = query.in('tipo', filters.tipoImovel);
  }
  if (filters.precoMin) {
    query = query.gte('preco_venda', parseFloat(filters.precoMin));
  }
  if (filters.precoMax) {
    query = query.lte('preco_venda', parseFloat(filters.precoMax));
  }
  if (filters.vagas !== null && filters.vagas !== undefined) {
    if (filters.vagas === '0') {
      query = query.eq('vagas', 0);
    } else {
      query = query.gte('vagas', parseInt(filters.vagas));
    }
  }
  if (filters.banheiros) {
    query = query.gte('banheiros', parseInt(filters.banheiros));
  }
  if (filters.areaMin) {
    query = query.gte('area_m2', parseFloat(filters.areaMin));
  }
  if (filters.areaMax) {
    query = query.lte('area_m2', parseFloat(filters.areaMax));
  }

  const { data, error } = await query.order('preco_venda', { ascending: true });

  if (error) throw error;

  // Client-side feature/tag filtering
  let result = data || [];

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
  const { data, error } = await db
    .from('scraper_runs')
    .select('*')
    .order('ran_at', { ascending: false })
    .limit(20);
  if (error) return [];
  return data || [];
}

export async function getStats() {
  const { data } = await db.from('properties').select('*');
  if (!data || !data.length) return null;

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
