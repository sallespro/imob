/**
 * Browser-side scraper using a CORS proxy or direct fetch.
 * Since the site doesn't have a public API, we scrape via a proxy endpoint.
 *
 * For development, run: npx local-cors-proxy --proxyUrl https://www.auxiliadorapredial.com.br --port 8010
 * Then set VITE_PROXY_URL=http://localhost:8010/proxy in .env
 *
 * Alternative: use Vite proxy config (see vite.config.js)
 */

const PROXY_BASE = import.meta.env.VITE_PROXY_URL || '/api-proxy';

export function buildSearchUrl(filters, page = 1) {
  const { transacao, categoria, cidade } = filters;
  const path = `/${transacao}/${categoria}/${cidade}`;
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (filters.quartos) params.set('quartos', filters.quartos);
  for (const t of (filters.tipoImovel || [])) params.append('tipoImovel', t);
  for (const b of (filters.bairro || [])) params.append('bairro', b);
  if (filters.precoMin) params.set('precoMin', filters.precoMin);
  if (filters.precoMax) params.set('precoMax', filters.precoMax);
  if (filters.vagas) params.set('vagas', filters.vagas);
  if (filters.banheiros) params.set('banheiros', filters.banheiros);
  if (filters.areaMin) params.set('areaMin', filters.areaMin);
  if (filters.areaMax) params.set('areaMax', filters.areaMax);
  if (filters.mobiliado) params.set('mobiliado', filters.mobiliado);
  if (filters.lancamentos) params.set('lancamentos', filters.lancamentos);
  if (filters.exclusivo) params.set('exclusivo', 'true');
  for (const c of (filters.comodidades || [])) params.append('comodidades', c);
  return `${path}?${params.toString()}`;
}

export function buildExternalUrl(filters, page = 1) {
  return `https://www.auxiliadorapredial.com.br${buildSearchUrl(filters, page)}`;
}

function parsePrice(text) {
  if (!text) return null;
  const clean = text.replace(/[^\d]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

function parseArea(text) {
  if (!text) return null;
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

export function parseHtmlListings(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const listings = [];
  const seen = new Set();

  doc.querySelectorAll('a[href*="/imovel/"]').forEach(el => {
    const href = el.getAttribute('href') || '';
    const fullUrl = href.startsWith('http') ? href : `https://www.auxiliadorapredial.com.br${href}`;
    const codeMatch = href.match(/\/imovel\/\w+\/(\d+)\//);
    const code = codeMatch ? codeMatch[1] : null;
    if (!code || seen.has(code)) return;
    seen.add(code);

    const text = el.textContent || '';

    const titleMatch = text.match(/^([^\n]+)/);
    const title = titleMatch ? titleMatch[1].trim() : '';

    const priceMatches = [...text.matchAll(/R\$\s*([\d.,]+)/g)];
    const priceNums = priceMatches.map(m => parsePrice(m[1])).filter(Boolean);
    const precoOriginal = priceNums[0] || null;
    const precoVenda = priceNums.length > 1 ? priceNums[priceNums.length - 1] : precoOriginal;

    const locMatch = text.match(/Localização\s+([^\n]+)/);
    const location = locMatch ? locMatch[1].trim() : '';
    const [bairro, cidadeRaw] = location.split(',').map(s => s.trim());

    const areaMatch = text.match(/Metragem\s+([\d]+)/);
    const area = areaMatch ? parseInt(areaMatch[1]) : null;
    const quartosMatch = text.match(/Quartos\s+(\d+)/);
    const quartos = quartosMatch ? parseInt(quartosMatch[1]) : null;
    const banheiroMatch = text.match(/Banheiros\s+(\d+)/);
    const banheiros = banheiroMatch ? parseInt(banheiroMatch[1]) : null;
    const vagasMatch = text.match(/Garagens\s+(\d+)/);
    const vagas = vagasMatch ? parseInt(vagasMatch[1]) : null;

    const knownFeatures = [
      'Área de serviço', 'Churrasqueira', 'Piscina', 'Água Quente',
      'Ar-condicionado', 'Sacada', 'Lavabo', 'Cozinha Montada', 'Living',
      'Lareira', 'Terraço', 'Alarme no Imóvel', 'Piscina Privativa',
      'Calefação', 'Sauna', 'Rua Silenciosa', 'Último andar', 'Térreo',
      'Elevador', 'Closet', 'Gás Central',
    ];
    const features = knownFeatures.filter(f => text.toLowerCase().includes(f.toLowerCase()));

    const tags = [];
    if (text.includes('Anúncio Novo')) tags.push('novo');
    if (text.includes('Baixou o preço')) tags.push('preco-baixou');
    if (text.includes('Avalia imóvel no negócio')) tags.push('avalia-imovel');
    if (text.includes('EXCLUSIVO')) tags.push('exclusivo');
    if (text.includes('Mobiliado')) tags.push('mobiliado');

    let tipo = 'Imóvel';
    const tipos = [
      'Apartamento garden', 'Casa em Condomínio', 'Cobertura horizontal',
      'Apartamento', 'Casa', 'Cobertura', 'Loft', 'Sobrado', 'Flat',
      'Terreno', 'Chácara', 'JK', 'Studio',
    ];
    for (const t of tipos) {
      if (title.toLowerCase().includes(t.toLowerCase())) { tipo = t; break; }
    }

    // Get image
    const img = el.querySelector('img');
    const imageUrl = img?.getAttribute('src') || img?.getAttribute('data-src') || null;

    listings.push({
      code,
      url: fullUrl,
      title,
      tipo,
      bairro: bairro || '',
      cidade: cidadeRaw || '',
      preco_original: precoOriginal,
      preco_venda: precoVenda,
      area_m2: area,
      quartos,
      banheiros,
      vagas,
      features: JSON.stringify(features),
      tags: JSON.stringify(tags),
      image_url: imageUrl,
      scraped_at: new Date().toISOString(),
    });
  });

  return listings;
}

export function getTotalPagesFromHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const nums = [];
  doc.querySelectorAll('a[href*="page="], button').forEach(el => {
    const m = (el.getAttribute('href') || '').match(/page=(\d+)/);
    if (m) nums.push(parseInt(m[1]));
    const t = parseInt(el.textContent.trim());
    if (!isNaN(t) && t > 0 && t < 1000) nums.push(t);
  });
  return nums.length ? Math.max(...nums) : 1;
}
