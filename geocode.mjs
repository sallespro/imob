/**
 * geocode.mjs — Backfill lat/lng for existing DB properties missing coordinates.
 * Uses Nominatim (OpenStreetMap) — max 1 req/sec per policy.
 *
 * Usage: node geocode.mjs [--all]
 *   --all  re-geocode even records that already have lat/lng
 */

const BB_URL = process.env.BUSYBASE_URL || 'http://localhost:54321';
const BB_KEY = process.env.BUSYBASE_KEY || 'local';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'imob-floripa/1.0 (cloud2pilot@gmail.com)';
const ALL = process.argv.includes('--all');

const HEADERS = { apikey: BB_KEY, Authorization: `Bearer ${BB_KEY}` };

async function fetchAll() {
  const res = await fetch(`${BB_URL}/rest/v1/properties?select=code,endereco,bairro,cidade,lat,lng&limit=100000`, { headers: HEADERS });
  if (!res.ok) throw new Error(`BusyBase error: ${res.status}`);
  const { data } = await res.json();
  return data || [];
}

async function geocode(endereco, bairro) {
  const query = endereco
    ? `${endereco}, ${bairro}, Florianópolis, SC, Brasil`
    : `${bairro}, Florianópolis, SC, Brasil`;
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const data = await res.json();
  if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  return null;
}

async function patchProperty(code, lat, lng) {
  await fetch(`${BB_URL}/rest/v1/properties?code=eq.${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: { ...HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ lat, lng }),
  });
}

async function main() {
  console.log('[geocode] Loading properties from BusyBase...');
  const rows = await fetchAll();
  const toGeocode = ALL ? rows : rows.filter(r => !r.lat || !r.lng);
  console.log(`[geocode] ${toGeocode.length} of ${rows.length} need geocoding`);

  let ok = 0, miss = 0, i = 0;
  for (const row of toGeocode) {
    i++;
    process.stdout.write(`\r[geocode] ${i}/${toGeocode.length} — ok:${ok} miss:${miss}   `);
    const coords = await geocode(row.endereco, row.bairro);
    if (coords) {
      await patchProperty(row.code, coords.lat, coords.lng);
      ok++;
    } else {
      miss++;
    }
    await new Promise(r => setTimeout(r, 1100)); // Nominatim rate limit
  }
  console.log(`\n[geocode] Done. ${ok} geocoded, ${miss} not found.`);
}

main().catch(err => { console.error('[geocode] Fatal:', err.message); process.exit(1); });
