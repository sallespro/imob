#!/usr/bin/env node
/**
 * scraper.js — Auxiliadora Predial property scraper (Playwright-based)
 *
 * The site is a Next.js RSC app — listings are rendered server-side and not
 * available via static HTML or GraphQL from a headless client. We use
 * Playwright to drive a real browser and extract data from the rendered DOM.
 *
 * Usage:
 *   node scripts/scraper.js [options]
 *
 * Options:
 *   --transacao      alugar|comprar (default: comprar)
 *   --categoria      residencial|comercial (default: residencial)
 *   --cidade         city slug (default: sc+florianopolis)
 *   --bairro         bairro name, repeatable
 *   --quartos        min bedrooms (1|2|3|4)
 *   --tipoImovel     property type, repeatable
 *   --precoMin       number
 *   --precoMax       number
 *   --vagas          0|1|2|3|4
 *   --banheiros      1|2|3|4
 *   --areaMin        number
 *   --areaMax        number
 *   --maxPages       number (default: all)
 *   --save           save to busybase (default: true)
 *   --busybaseUrl    busybase server URL (default: http://localhost:54321)
 *   --busybaseKey    busybase anon key (default: local)
 *   --help           show this help
 *
 * Example:
 *   node scripts/scraper.js --bairro=Campeche --quartos=3 --maxPages=5
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(__dirname, '..', 'images');
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const SITE_BASE = 'https://www.auxiliadorapredial.com.br';
const PAGE_SIZE = 21; // listings per page on the site

function parseArgs(argv) {
  const args = {
    transacao: 'comprar',
    categoria: 'residencial',
    cidade: 'sc+florianopolis',
    bairro: [],
    quartos: null,
    tipoImovel: [],
    precoMin: null,
    precoMax: null,
    vagas: null,
    banheiros: null,
    areaMin: null,
    areaMax: null,
    maxPages: null,
    save: true,
    busybaseUrl: process.env.BUSYBASE_URL || 'http://localhost:54321',
    busybaseKey: process.env.BUSYBASE_KEY || 'local',
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--help') { console.log(helpText()); process.exit(0); }
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    const val = rest.join('=');
    switch (key) {
      case 'transacao': args.transacao = val; break;
      case 'categoria': args.categoria = val; break;
      case 'cidade': args.cidade = val; break;
      case 'bairro': args.bairro.push(val); break;
      case 'quartos': args.quartos = val; break;
      case 'tipoImovel': args.tipoImovel.push(val); break;
      case 'precoMin': args.precoMin = val; break;
      case 'precoMax': args.precoMax = val; break;
      case 'vagas': args.vagas = val; break;
      case 'banheiros': args.banheiros = val; break;
      case 'areaMin': args.areaMin = val; break;
      case 'areaMax': args.areaMax = val; break;
      case 'maxPages': args.maxPages = parseInt(val); break;
      case 'save': args.save = val !== 'false'; break;
      case 'busybaseUrl': args.busybaseUrl = val; break;
      case 'busybaseKey': args.busybaseKey = val; break;
    }
  }
  return args;
}

function buildUrl(args, page = 1) {
  const path = `/${args.transacao}/${args.categoria}/${args.cidade}`;
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (args.quartos) params.set('quartos', args.quartos);
  for (const t of args.tipoImovel) params.append('tipoImovel', t);
  if (args.bairro.length > 0) params.set('bairro', args.bairro.join(','));
  if (args.precoMin) params.set('precoMin', args.precoMin);
  if (args.precoMax) params.set('precoMax', args.precoMax);
  if (args.vagas) params.set('vagas', args.vagas);
  if (args.banheiros) params.set('banheiros', args.banheiros);
  if (args.areaMin) params.set('areaMin', args.areaMin);
  if (args.areaMax) params.set('areaMax', args.areaMax);
  const qs = params.toString();
  return `${SITE_BASE}${path}${qs ? '?' + qs : ''}`;
}

function parsePrice(str) {
  if (!str) return null;
  // "R$ 1.040.000" or "1.040.000"
  const clean = str.replace(/[^\d]/g, '');
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

/**
 * Extract all listing cards from the currently rendered page.
 * Cards are identified by [data-imovel-codigo] attribute.
 * Text format per card:
 *   <tipo> para comprar
 *   R$ <price>  (or: de R$ <original>\npor R$ <sale>)
 *   ⓘ
 *   Custos adicionais
 *   <street>
 *   <bairro>, Florianópolis - SC
 *   <area>m²
 *   <quartos>  (number only)
 *   <banheiros>
 *   <vagas>
 *   <tag> <tag> ...
 */
async function extractListingsFromPage(page) {
  return page.evaluate((siteBase) => {
    const cards = document.querySelectorAll('[data-imovel-codigo]');
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const codigo = card.getAttribute('data-imovel-codigo');
      if (!codigo || seen.has(codigo)) continue;
      seen.add(codigo);

      const link = card.querySelector('a[href*="/imovel/"]');
      const href = link?.getAttribute('href') || '';
      const url = href.startsWith('http') ? href : siteBase + href;

      // Type from URL slug
      const tipoSlug = href.match(/\/imovel\/[^\/]+\/\d+\/([^+%?]+)/)?.[1] || '';
      const tipo = tipoSlug
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

      // Image
      const img = card.querySelector('img[src*="img.auxiliadorapredial"]') ||
                  card.querySelector('img[srcset*="img.auxiliadorapredial"]');
      const imgSrc = img?.src || img?.srcset?.match(/https[^\s,]+/)?.[0] || null;
      // Prefer original thumb URL, not Next.js proxy
      const thumbMatch = (img?.srcset || img?.src || '').match(/url=([^&\s]+)/);
      const imageUrl = thumbMatch ? decodeURIComponent(thumbMatch[1]) : imgSrc;

      // Text from card (skip the image swiper section — use innerText)
      const text = card.innerText || '';
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

      // Prices: look for R$ patterns in text
      const priceMatches = text.match(/R\$\s*[\d.,]+/g) || [];
      const prices = priceMatches.map(p => {
        const clean = p.replace(/[^\d]/g, '');
        const n = parseFloat(clean);
        return isNaN(n) ? null : n;
      }).filter(Boolean);

      const precoVenda = prices.length > 0 ? prices[prices.length - 1] : null;
      const precoOriginal = prices.length > 1 ? prices[0] : null;

      // Area
      const areaMatch = text.match(/(\d+)\s*m[²2]/);
      const areaN = areaMatch ? parseInt(areaMatch[1]) : null;

      // Bairro: line containing ", Florianópolis" or "Florianopolis"
      let bairro = null;
      let cidade = 'Florianópolis';
      for (const line of lines) {
        const m = line.match(/^(.+?),\s*(Florian[oó]polis|Ilha)/i);
        if (m) {
          // The bairro is in the line before the address, but text bunches them together
          // The format is: "<street>\n<bairro>, Florianópolis - SC"
          // Since innerText merges them, just take everything before the comma
          bairro = m[1].trim();
          break;
        }
      }

      // Rooms: after area line, there are 3 numbers (quartos, banheiros, vagas)
      // They appear as individual digit lines after the m² line
      const numbers = [];
      let pastArea = false;
      for (const line of lines) {
        if (line.match(/\d+\s*m[²2]/)) { pastArea = true; continue; }
        if (pastArea && /^\d+$/.test(line)) {
          numbers.push(parseInt(line));
          if (numbers.length === 3) break;
        }
        if (pastArea && numbers.length > 0 && !/^\d+$/.test(line)) break;
      }
      const [quartos, banheiros, vagas] = numbers;

      // Tags
      const tags = [];
      if (text.includes('EXCLUSIVO') || text.includes('Exclusivo')) tags.push('exclusivo');
      if (text.includes('Baixou o preço') || text.includes('Baixou preço')) tags.push('preco-baixou');
      if (text.includes('Anúncio Novo')) tags.push('novo');
      if (text.includes('Avalia imóvel no negócio')) tags.push('avalia-imovel');
      if (text.includes('Semi-Mobiliado')) tags.push('semi-mobiliado');
      else if (text.includes('Mobiliado')) tags.push('mobiliado');

      // Features
      const knownFeatures = [
        'Área de serviço', 'Churrasqueira', 'Piscina', 'Água Quente',
        'Ar-condicionado', 'Sacada', 'Lavabo', 'Cozinha Montada', 'Living',
        'Lareira', 'Terraço', 'Alarme no Imóvel', 'Piscina Privativa',
        'Calefação', 'Sauna', 'Rua Silenciosa', 'Último andar', 'Térreo',
        'Elevador', 'Closet', 'Gás Central',
      ];
      const features = knownFeatures.filter(f => text.includes(f));

      // Street: line before the "bairro, Florianópolis" line
      let endereco = null;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/,\s*Florian[oó]polis/i) && i > 0) {
          const candidate = lines[i - 1];
          // must look like a street (has letters, not just a price/number)
          if (/[a-zA-ZÀ-ú]/.test(candidate) && !candidate.match(/^R\$/)) {
            endereco = candidate.trim();
          }
          break;
        }
      }

      // Title from first lines
      const titleLine = lines.find(l => l.includes('para comprar') || l.includes('para alugar')) || tipo;

      results.push({
        code: codigo,
        url,
        title: titleLine,
        tipo,
        bairro: bairro || '',
        cidade,
        endereco: endereco || '',
        preco_venda: precoVenda || 0,
        preco_original: precoOriginal || 0,
        area_m2: areaN || 0,
        quartos: quartos || 0,
        banheiros: banheiros || 0,
        vagas: vagas !== undefined ? vagas : 0,
        features: JSON.stringify(features),
        tags: JSON.stringify(tags),
        image_url: imageUrl,
        scraped_at: new Date().toISOString(),
      });
    }

    return results;
  }, SITE_BASE);
}

async function getTotalFromPage(page) {
  return page.evaluate(() => {
    const text = document.body.innerText;
    const m = text.match(/(\d+\.?\d*)\s*im[oó]veis?/i);
    if (!m) return null;
    return parseInt(m[1].replace(/\./g, ''));
  });
}

async function saveToDb(bbUrl, bbKey, listings) {
  if (!listings.length) return;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': bbKey,
    'Authorization': `Bearer ${bbKey}`,
    'Prefer': 'resolution=merge-duplicates,return=minimal',
  };
  const batchSize = 20;
  for (let i = 0; i < listings.length; i += batchSize) {
    const batch = listings.slice(i, i + batchSize);
    const res = await fetch(`${bbUrl}/rest/v1/properties`, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) throw new Error(json.error?.message || JSON.stringify(json.error) || `HTTP ${res.status}`);
    // BusyBase's LanceDB layer can crash (detached Arrow buffer) if writes land
    // back-to-back with no time to settle/compact. Small delay between batches
    // avoids racing a background compaction against the next insert.
    if (i + batchSize < listings.length) await new Promise(r => setTimeout(r, 300));
  }
}

async function downloadImages(listings) {
  let downloaded = 0, skipped = 0, failed = 0;
  for (const listing of listings) {
    if (!listing.image_url) continue;
    const dest = path.join(IMAGES_DIR, `${listing.code}.webp`);
    if (fs.existsSync(dest)) {
      listing.image_local = `/images/${listing.code}.webp`;
      skipped++;
      continue;
    }
    try {
      const res = await fetch(listing.image_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await sharp(buf).resize(600, 400, { fit: 'cover' }).webp({ quality: 80 }).toFile(dest);
      listing.image_local = `/images/${listing.code}.webp`;
      downloaded++;
    } catch (err) {
      failed++;
    }
  }
  console.log(`Images: ${downloaded} downloaded, ${skipped} cached, ${failed} failed`);
}

async function geocodeOne(query, UA) {
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const data = await res.json();
  return data[0] ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null;
}

async function geocodeListings(listings) {
  const UA = 'imob-floripa/1.0 (cloud2pilot@gmail.com)';

  // Build unique queries to avoid hitting Nominatim for every duplicate address
  const fullQuery = l => l.endereco
    ? `${l.endereco}, ${l.bairro}, Florianópolis, SC, Brasil`
    : `${l.bairro}, Florianópolis, SC, Brasil`;
  const bairroQuery = l => `${l.bairro}, Florianópolis, SC, Brasil`;

  const cache = new Map(); // query -> {lat, lng} | null
  const toFetch = [];
  for (const l of listings) {
    if (l.lat && l.lng) continue;
    const query = fullQuery(l);
    if (!cache.has(query)) {
      cache.set(query, null);
      toFetch.push(query);
    }
  }

  console.log(`  Geocoding ${toFetch.length} unique addresses (${listings.filter(l => !l.lat).length} listings)...`);
  let ok = 0, miss = 0;

  for (let i = 0; i < toFetch.length; i++) {
    const query = toFetch[i];
    if ((i + 1) % 10 === 0 || i === toFetch.length - 1) {
      process.stdout.write(`\r  Geocoding: ${i + 1}/${toFetch.length} — found:${ok} miss:${miss}   `);
    }
    try {
      const coords = await geocodeOne(query, UA);
      if (coords) {
        cache.set(query, coords);
        ok++;
      } else {
        miss++;
      }
    } catch {
      miss++;
    }
    await new Promise(r => setTimeout(r, 1100));
  }

  // Retry misses with just the bairro — a precise street address often doesn't
  // exist in OSM's data for Brazilian listings, but the neighborhood usually does.
  const missedQueries = toFetch.filter(q => cache.get(q) === null);
  if (missedQueries.length) {
    const bairroFallbacks = new Map(); // bairroQuery -> {lat,lng} | null
    const listingsByQuery = new Map();
    for (const l of listings) {
      if (l.lat && l.lng) continue;
      const q = fullQuery(l);
      if (missedQueries.includes(q) && !listingsByQuery.has(q)) listingsByQuery.set(q, l);
    }
    let recovered = 0;
    for (const query of missedQueries) {
      const l = listingsByQuery.get(query);
      if (!l) continue;
      const bq = bairroQuery(l);
      if (!bairroFallbacks.has(bq)) {
        try {
          bairroFallbacks.set(bq, await geocodeOne(bq, UA));
        } catch {
          bairroFallbacks.set(bq, null);
        }
        await new Promise(r => setTimeout(r, 1100));
      }
      const coords = bairroFallbacks.get(bq);
      if (coords) {
        cache.set(query, coords);
        ok++;
        miss--;
        recovered++;
      }
    }
    if (recovered) console.log(`\n  Recovered ${recovered} via bairro-level fallback`);
  }

  console.log(`\n  Done: ${ok} found, ${miss} not found`);

  // Apply cached coords back to all listings
  for (const l of listings) {
    if (l.lat && l.lng) continue;
    const coords = cache.get(fullQuery(l));
    if (coords) { l.lat = coords.lat; l.lng = coords.lng; }
  }
}

async function saveScraperRun(bbUrl, bbKey, filters, totalFound) {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': bbKey,
    'Authorization': `Bearer ${bbKey}`,
    'Prefer': 'return=minimal',
  };
  await fetch(`${bbUrl}/rest/v1/scraper_runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ filters, total_found: totalFound, ran_at: new Date().toISOString() }),
  });
}

function helpText() {
  return `
Auxiliadora Predial Scraper (Playwright)
Usage: node scripts/scraper.js [options]

Options:
  --transacao=<alugar|comprar>     Transaction type (default: comprar)
  --categoria=<residencial|comercial>  Category (default: residencial)
  --cidade=<slug>                  City slug (default: sc+florianopolis)
  --bairro=<name>                  Neighborhood, can repeat
  --quartos=<1-4>                  Minimum bedrooms
  --tipoImovel=<type>              Property type, can repeat
  --precoMin=<number>              Minimum price (BRL)
  --precoMax=<number>              Maximum price (BRL)
  --vagas=<0-4>                    Minimum parking spots
  --banheiros=<1-4>                Minimum bathrooms
  --areaMin=<m2>                   Minimum area in m²
  --areaMax=<m2>                   Maximum area in m²
  --maxPages=<n>                   Limit pages to scrape
  --save=<true|false>              Save to BusyBase (default: true)
  --busybaseUrl=<url>              BusyBase URL (default: http://localhost:54321)
  --busybaseKey=<key>              BusyBase key (default: local)
  --help                           Show this help

Example:
  node scripts/scraper.js --bairro=Campeche --quartos=3 --maxPages=5
`;
}

async function main() {
  const args = parseArgs(process.argv);

  console.log('\n🏠 Auxiliadora Predial Scraper (Playwright)');
  console.log('============================================');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'pt-BR',
  });
  const page = await context.newPage();

  // Block images and fonts to speed up loading
  await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,eot}', r => r.abort());

  try {
    const firstUrl = buildUrl(args, 1);
    console.log(`\nLoading page 1: ${firstUrl}`);
    await page.goto(firstUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Get total count
    const totalImoveis = await getTotalFromPage(page);
    const totalPages = totalImoveis ? Math.ceil(totalImoveis / PAGE_SIZE) : 1;
    const pagesToScrape = args.maxPages ? Math.min(args.maxPages, totalPages) : totalPages;

    console.log(`Found ~${totalImoveis} imóveis across ${totalPages} pages`);
    console.log(`Scraping ${pagesToScrape} pages...\n`);

    let allListings = [];
    const seen = new Set();

    // Extract page 1
    const page1Listings = await extractListingsFromPage(page);
    for (const l of page1Listings) {
      if (!seen.has(l.code)) { seen.add(l.code); allListings.push(l); }
    }
    console.log(`Page 1: ${page1Listings.length} listings (total: ${allListings.length})`);

    // Remaining pages
    for (let p = 2; p <= pagesToScrape; p++) {
      await new Promise(r => setTimeout(r, 1000));
      const url = buildUrl(args, p);
      console.log(`Loading page ${p}/${pagesToScrape}: ${url}`);
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
        const listings = await extractListingsFromPage(page);
        let newCount = 0;
        for (const l of listings) {
          if (!seen.has(l.code)) { seen.add(l.code); allListings.push(l); newCount++; }
        }
        console.log(`Page ${p}: ${listings.length} listings (+${newCount} new, total: ${allListings.length})`);
      } catch (err) {
        console.error(`  Page ${p} error: ${err.message}`);
      }
    }

    console.log(`\n✅ Total unique listings scraped: ${allListings.length}`);

    if (allListings.length) {
      console.log('\nDownloading images...');
      await downloadImages(allListings);
      console.log('\nGeocoding addresses...');
      await geocodeListings(allListings);
    }

    if (args.save && allListings.length) {
      console.log('\nSaving to BusyBase...');
      await saveToDb(args.busybaseUrl, args.busybaseKey, allListings);
      await saveScraperRun(args.busybaseUrl, args.busybaseKey, JSON.stringify(args), allListings.length);
      console.log('✅ Saved to BusyBase');
    }

    // Summary
    const byType = {};
    for (const l of allListings) byType[l.tipo] = (byType[l.tipo] || 0) + 1;
    console.log('\n--- By type ---');
    for (const [t, n] of Object.entries(byType)) console.log(`  ${t}: ${n}`);

    const prices = allListings.map(l => l.preco_venda).filter(Boolean);
    if (prices.length) {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      console.log(`\nPrice range: R$ ${Math.min(...prices).toLocaleString('pt-BR')} – R$ ${Math.max(...prices).toLocaleString('pt-BR')}`);
      console.log(`Average: R$ ${avg.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`);
    }

    return allListings;
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
