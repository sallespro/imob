const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export async function initAuth() {}

export async function getProperties(filters = {}) {
  let result = await apiFetch('/properties');
  if (!Array.isArray(result)) result = [];
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

export async function getScraperRuns() { return []; }

// Dataset management
export async function listDatasets() { return apiFetch('/datasets'); }
export async function getActiveDataset() { return apiFetch('/datasets/active'); }
export async function createDataset(name, label) {
  return apiFetch('/datasets', { method: 'POST', body: JSON.stringify({ name, label }) });
}
export async function switchDataset(name) {
  return apiFetch('/datasets/active', { method: 'POST', body: JSON.stringify({ name }) });
}
export async function deleteDataset(name) {
  return apiFetch(`/datasets/${name}`, { method: 'DELETE' });
}
export async function getScrapeStatus() { return apiFetch('/scrape/status'); }

export async function upsertProperties(listings) {
  for (let i = 0; i < listings.length; i += 100) {
    await apiFetch('/properties', { method: 'POST', body: JSON.stringify(listings.slice(i, i + 100)) });
  }
}

export async function insertScraperRun() {}
