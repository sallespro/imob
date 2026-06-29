#!/usr/bin/env node
/**
 * scraper.js — Auxiliadora Predial property scraper
 *
 * Usage:
 *   node scripts/scraper.js [options]
 *
 * Options:
 *   --transacao      alugar|comprar (default: comprar)
 *   --categoria      residencial|comercial (default: residencial)
 *   --cidade         e.g. "sc+florianopolis" (default: sc+florianopolis)
 *   --bairro         bairro name, repeatable
 *   --quartos        1|2|3|4
 *   --tipoImovel     Casa|Apartamento|Lote/Terreno|... (repeatable)
 *   --precoMin       number
 *   --precoMax       number
 *   --vagas          0|1|2|3|4
 *   --banheiros      1|2|3|4
 *   --areaMin        number
 *   --areaMax        number
 *   --mobiliado      Sim|Semi|Nao
 *   --lancamentos    Sim|Nao
 *   --exclusivo      boolean
 *   --comodidades    comma-separated list
 *   --anuncio        BaixouPreco|AvaliaImovel
 *   --maxPages       number (default: all)
 *   --save           save to busybase (default: true)
 *   --busybaseUrl    busybase server URL (default: http://localhost:54321)
 *   --busybaseKey    busybase anon key (default: local)
 *   --help           show this help
 *
 * Example:
 *   node scripts/scraper.js --bairro=Campeche --bairro="Porto da Lagoa" --quartos=3 --tipoImovel=Casa
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

const SITE_BASE = 'https://www.auxiliadorapredial.com.br';

// Parse CLI args
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
    mobiliado: null,
    lancamentos: null,
    exclusivo: null,
    comodidades: [],
    anuncio: [],
    maxPages: null,
    save: true,
    busybaseUrl: process.env.BUSYBASE_URL || 'http://localhost:54321',
    busybaseKey: process.env.BUSYBASE_KEY || 'local',
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--help') {
      console.log(helpText());
      process.exit(0);
    }
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
      case 'mobiliado': args.mobiliado = val; break;
      case 'lancamentos': args.lancamentos = val; break;
      case 'exclusivo': args.exclusivo = val !== 'false'; break;
      case 'comodidades': args.comodidades = val.split(',').map(c => c.trim()); break;
      case 'anuncio': args.anuncio.push(val); break;
      case 'maxPages': args.maxPages = parseInt(val); break;
      case 'save': args.save = val !== 'false'; break;
      case 'busybaseUrl': args.busybaseUrl = val; break;
      case 'busybaseKey': args.busybaseKey = val; break;
    }
  }
  return args;
}

function buildUrl(args, page) {
  const path = `/${args.transacao}/${args.categoria}/${args.cidade}`;
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (args.quartos) params.set('quartos', args.quartos);
  for (const t of args.tipoImovel) params.append('tipoImovel', t);
  for (const b of args.bairro) params.append('bairro', b);
  if (args.precoMin) params.set('precoMin', args.precoMin);
  if (args.precoMax) params.set('precoMax', args.precoMax);
  if (args.vagas) params.set('vagas', args.vagas);
  if (args.banheiros) params.set('banheiros', args.banheiros);
  if (args.areaMin) params.set('areaMin', args.areaMin);
  if (args.areaMax) params.set('areaMax', args.areaMax);
  if (args.mobiliado) params.set('mobiliado', args.mobiliado);
  if (args.lancamentos) params.set('lancamentos', args.lancamentos);
  if (args.exclusivo) params.set('exclusivo', 'true');
  for (const c of args.comodidades) params.append('comodidades', c);
  for (const a of args.anuncio) params.append('anuncio', a);
  return `${SITE_BASE}${path}?${params.toString()}`;
}

function parsePrice(text) {
  if (!text) return null;
  const clean = text.replace(/[^\d,]/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

function parseArea(text) {
  if (!text) return null;
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function scrapeListings($) {
  const listings = [];

  // Each listing card
  $('a[href*="/imovel/"]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    if (!href || listings.some(l => l.url === href)) return;

    const text = $el.text();

    // Extract code from URL e.g. /imovel/venda/762862/
    const codeMatch = href.match(/\/imovel\/\w+\/(\d+)\//);
    const code = codeMatch ? codeMatch[1] : null;

    // Try to parse structured data from link text
    const titleMatch = text.match(/^([^\n]+)/);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Price — look for R$ pattern
    const priceMatch = text.match(/R\$\s*([\d.,]+)/g);
    const originalPrice = priceMatch ? parsePrice(priceMatch[0]) : null;
    const salePrice = priceMatch && priceMatch.length > 1 ? parsePrice(priceMatch[priceMatch.length - 1]) : originalPrice;

    // Location
    const locMatch = text.match(/Localização\s+([^\n]+)/);
    const location = locMatch ? locMatch[1].trim() : '';
    const [bairro, cityState] = location.split(',').map(s => s.trim());

    // Metrics
    const areaMatch = text.match(/Metragem\s+([\d]+m²)/);
    const area = areaMatch ? parseArea(areaMatch[1]) : null;
    const quartosMatch = text.match(/Quartos\s+(\d+)/);
    const quartos = quartosMatch ? parseInt(quartosMatch[1]) : null;
    const banheiroMatch = text.match(/Banheiros\s+(\d+)/);
    const banheiros = banheiroMatch ? parseInt(banheiroMatch[1]) : null;
    const vagasMatch = text.match(/Garagens\s+(\d+)/);
    const vagas = vagasMatch ? parseInt(vagasMatch[1]) : null;

    // Features
    const knownFeatures = [
      'Área de serviço', 'Churrasqueira', 'Piscina', 'Água Quente',
      'Ar-condicionado', 'Sacada', 'Lavabo', 'Cozinha Montada', 'Living',
      'Lareira', 'Terraço', 'Alarme no Imóvel', 'Piscina Privativa',
      'Calefação', 'Sauna', 'Rua Silenciosa', 'Último andar', 'Térreo', 'Elevador',
      'Closet', 'Gás Central', 'Anúncio Novo', 'Baixou o preço',
      'Avalia imóvel no negócio', 'Mobiliado',
    ];
    const features = knownFeatures.filter(f => text.toLowerCase().includes(f.toLowerCase()));

    // Tags
    const tags = [];
    if (text.includes('Anúncio Novo')) tags.push('novo');
    if (text.includes('Baixou o preço')) tags.push('preco-baixou');
    if (text.includes('Avalia imóvel no negócio')) tags.push('avalia-imovel');
    if (text.includes('EXCLUSIVO')) tags.push('exclusivo');
    if (text.includes('Mobiliado')) tags.push('mobiliado');

    // Type detection from title
    let tipo = 'Imóvel';
    const tipos = ['Apartamento', 'Casa em Condomínio', 'Casa', 'Cobertura', 'Loft', 'Sobrado', 'Flat', 'Terreno', 'Chácara'];
    for (const t of tipos) {
      if (title.toLowerCase().includes(t.toLowerCase())) { tipo = t; break; }
    }

    if (!code) return;

    listings.push({
      code,
      url: href.startsWith('http') ? href : `${SITE_BASE}${href}`,
      title,
      tipo,
      bairro: bairro || '',
      cidade: cityState || '',
      preco_original: originalPrice,
      preco_venda: salePrice,
      area_m2: area,
      quartos,
      banheiros,
      vagas,
      features: JSON.stringify(features),
      tags: JSON.stringify(tags),
      scraped_at: new Date().toISOString(),
    });
  });

  return listings;
}

function getTotalPages($) {
  // Look for pagination — try to find last page number
  const pageLinks = [];
  $('a[href*="page="]').each((_, el) => {
    const match = $(el).attr('href').match(/page=(\d+)/);
    if (match) pageLinks.push(parseInt(match[1]));
  });
  // Also check button text
  $('button').each((_, el) => {
    const n = parseInt($(el).text().trim());
    if (!isNaN(n) && n > 0) pageLinks.push(n);
  });
  return pageLinks.length ? Math.max(...pageLinks) : 1;
}

async function fetchPage(url) {
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
    timeout: 15000,
  });
  return cheerio.load(res.data);
}

async function saveToDb(db, listings) {
  if (!listings.length) return;

  // Upsert by code to avoid duplicates
  const { error } = await db.from('properties')
    .upsert(listings, { onConflict: 'code' });

  if (error) {
    console.error('DB error:', error.message);
    throw error;
  }
}

async function saveScraperRun(db, args, totalFound) {
  await db.from('scraper_runs').insert({
    filters: JSON.stringify(args),
    total_found: totalFound,
    ran_at: new Date().toISOString(),
  });
}

function helpText() {
  return `
Auxiliadora Predial Scraper
Usage: node scripts/scraper.js [options]

Options:
  --transacao=<alugar|comprar>    Transaction type (default: comprar)
  --categoria=<residencial|comercial>  Category (default: residencial)
  --cidade=<slug>                 City slug (default: sc+florianopolis)
  --bairro=<name>                 Neighborhood, can repeat
  --quartos=<1-4>                 Minimum bedrooms
  --tipoImovel=<type>             Property type, can repeat
                                  Types: Casa, Apartamento, Lote/Terreno,
                                  Casa em condomínio, Chácara/Sítio/Fazenda,
                                  Apartamento garden, Cobertura, JK/Loft/Studio,
                                  Sobrado, Flat, Loft, Cobertura horizontal
  --precoMin=<number>             Minimum price (BRL)
  --precoMax=<number>             Maximum price (BRL)
  --vagas=<0-4>                   Minimum parking spots
  --banheiros=<1-4>               Minimum bathrooms
  --areaMin=<m2>                  Minimum area in m²
  --areaMax=<m2>                  Maximum area in m²
  --mobiliado=<Sim|Semi|Nao>      Furnished status
  --lancamentos=<Sim|Nao>         New developments only
  --exclusivo                     Exclusive listings only
  --comodidades=<c1,c2,...>       Amenities filter (comma-separated)
                                  Options: area-de-servico, churrasqueira,
                                  piscina, agua-quente, ar-condicionado, sacada,
                                  lavabo, cozinha-montada, living, lareira,
                                  terraco, alarme-no-imovel, piscina-privativa,
                                  calefacao, sauna, rua-silenciosa, ultimo-andar,
                                  terreo, elevador
  --anuncio=<type>                Ad filter, can repeat
                                  Options: BaixouPreco, AvaliaImovel
  --maxPages=<n>                  Limit pages to scrape
  --save=<true|false>             Save to BusyBase (default: true)
  --busybaseUrl=<url>             BusyBase URL (default: http://localhost:54321)
  --busybaseKey=<key>             BusyBase key (default: local)
  --help                          Show this help

Environment variables:
  BUSYBASE_URL     BusyBase server URL
  BUSYBASE_KEY     BusyBase anon key

Example:
  node scripts/scraper.js \\
    --bairro=Campeche --bairro="Porto da Lagoa" \\
    --quartos=3 --tipoImovel=Casa \\
    --maxPages=5
`;
}

async function main() {
  const args = parseArgs(process.argv);

  let db = null;
  if (args.save) {
    db = createClient(args.busybaseUrl, args.busybaseKey);
    // Sign in anonymously
    try {
      await db.auth.signInAnonymously();
    } catch {
      // BusyBase keypair auth
      try {
        await db.auth.keypair?.signIn();
      } catch {
        console.warn('Auth skipped — proceeding without auth');
      }
    }
  }

  console.log('\n🏠 Auxiliadora Predial Scraper');
  console.log('================================');

  // First page to determine total
  const firstUrl = buildUrl(args, 1);
  console.log(`\nFetching page 1: ${firstUrl}\n`);

  let $ = await fetchPage(firstUrl);
  const totalPages = args.maxPages ? Math.min(args.maxPages, getTotalPages($)) : getTotalPages($);
  console.log(`Found ${totalPages} pages to scrape`);

  let allListings = scrapeListings($);
  console.log(`Page 1: ${allListings.length} listings`);

  // Remaining pages
  for (let page = 2; page <= totalPages; page++) {
    const url = buildUrl(args, page);
    console.log(`Fetching page ${page}/${totalPages}: ${url}`);
    try {
      await new Promise(r => setTimeout(r, 800)); // polite delay
      $ = await fetchPage(url);
      const listings = scrapeListings($);
      allListings = allListings.filter(l => !listings.some(n => n.code === l.code));
      allListings.push(...listings);
      console.log(`Page ${page}: ${listings.length} listings (total: ${allListings.length})`);
    } catch (err) {
      console.error(`Page ${page} error:`, err.message);
    }
  }

  console.log(`\n✅ Total unique listings: ${allListings.length}`);

  if (args.save && db && allListings.length) {
    console.log('\nSaving to BusyBase...');
    // Save in batches of 50
    const batchSize = 50;
    for (let i = 0; i < allListings.length; i += batchSize) {
      const batch = allListings.slice(i, i + batchSize);
      await saveToDb(db, batch);
      console.log(`  Saved batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allListings.length / batchSize)}`);
    }
    await saveScraperRun(db, args, allListings.length);
    console.log('✅ Saved to BusyBase');
  }

  // Print summary
  console.log('\n--- Summary ---');
  const byType = {};
  for (const l of allListings) {
    byType[l.tipo] = (byType[l.tipo] || 0) + 1;
  }
  for (const [tipo, count] of Object.entries(byType)) {
    console.log(`  ${tipo}: ${count}`);
  }

  const prices = allListings.map(l => l.preco_venda).filter(Boolean);
  if (prices.length) {
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    console.log(`\nPrice range: R$ ${min.toLocaleString('pt-BR')} – R$ ${max.toLocaleString('pt-BR')}`);
    console.log(`Average: R$ ${avg.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`);
  }

  return allListings;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
