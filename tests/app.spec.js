/**
 * End-to-end tests for the Imóveis Florianópolis app.
 * Requires:
 *   - BusyBase running: bunx busybase serve (port 54321)
 *   - Vite dev server running: cd imob-app && npm run dev (port 5173)
 *
 * Run: npx playwright test tests/app.spec.js --reporter=list
 */

import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:5173';
const BB_BASE = 'http://127.0.0.1:54321/rest/v1';

// ─── Helpers ────────────────────────────────────────────────────────────────

const bbHeaders = {
  'Content-Type': 'application/json',
  'apikey': 'anon',
  'Prefer': 'return=representation',
};

async function seedProperty(props = {}) {
  const defaults = {
    code: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    url: 'https://www.auxiliadorapredial.com.br/imovel/casa/999/',
    title: 'Casa Teste',
    tipo: 'Casa',
    bairro: 'Campeche',
    cidade: 'Florianópolis',
    preco_venda: 850000,
    preco_original: 900000,
    area_m2: 120,
    quartos: 3,
    banheiros: 2,
    vagas: 2,
    features: JSON.stringify(['Piscina', 'Churrasqueira']),
    tags: JSON.stringify(['novo']),
    scraped_at: new Date().toISOString(),
  };
  const payload = { ...defaults, ...props };
  const res = await fetch(`${BB_BASE}/properties`, {
    method: 'POST',
    headers: bbHeaders,
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (json.error) throw new Error(`Seed failed: ${json.error.message}`);
  return (json.data || [])[0] || json;
}

async function cleanTestData() {
  const res = await fetch(`${BB_BASE}/properties`, { headers: { apikey: 'anon' } });
  const json = await res.json();
  const testRows = (json.data || []).filter(r => r.code?.startsWith('TEST-'));
  for (const row of testRows) {
    await fetch(`${BB_BASE}/properties?eq.code=${encodeURIComponent(row.code)}`, {
      method: 'DELETE',
      headers: { apikey: 'anon' },
    });
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('App shell & header', () => {
  test('renders header with title and BusyBase status', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.locator('.app-header')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Imóveis Florianópolis');
    // Wait for BusyBase connection
    await expect(page.locator('.db-ok')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.db-error')).not.toBeVisible();
  });
});

test.describe('Filter panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 10000 });
  });

  test('renders all filter sections', async ({ page }) => {
    const sections = page.locator('.filter-section-header');
    const titles = await sections.allTextContents();
    const expected = ['Transação', 'Categoria', 'Preço', 'Quartos', 'Tipo de Imóvel', 'Bairros'];
    for (const title of expected) {
      expect(titles.some(t => t.includes(title))).toBeTruthy();
    }
  });

  test('Transação toggle switches between Comprar and Alugar', async ({ page }) => {
    const comprar = page.locator('.toggle-btn', { hasText: 'Comprar' });
    const alugar = page.locator('.toggle-btn', { hasText: 'Alugar' });
    await expect(comprar).toHaveClass(/active/);
    await alugar.click();
    await expect(alugar).toHaveClass(/active/);
    await expect(comprar).not.toHaveClass(/active/);
  });

  test('Categoria toggle switches between Residencial and Comercial', async ({ page }) => {
    const residencial = page.locator('.toggle-btn', { hasText: 'Residencial' });
    const comercial = page.locator('.toggle-btn', { hasText: 'Comercial' });
    await expect(residencial).toHaveClass(/active/);
    await comercial.click();
    await expect(comercial).toHaveClass(/active/);
  });

  test('Quartos toggle selects min bedrooms', async ({ page }) => {
    // Quartos section: options have labels 1+/2+/3+/4+ and values 1/2/3/4
    // The section header is the 4th filter-section, use within scoping
    const quartosSection = page.locator('.filter-section').filter({ has: page.locator('.filter-section-header', { hasText: 'Quartos' }) });
    const btn3 = quartosSection.locator('.toggle-btn', { hasText: '3+' });
    await btn3.click();
    await expect(btn3).toHaveClass(/active/);
    await btn3.click();
    await expect(btn3).not.toHaveClass(/active/);
  });

  test('Tipo de Imóvel checkbox toggles', async ({ page }) => {
    const casaCheckbox = page.locator('.checkbox-item').filter({ hasText: 'Casa' }).locator('input').first();
    await casaCheckbox.check();
    await expect(casaCheckbox).toBeChecked();
    await casaCheckbox.uncheck();
    await expect(casaCheckbox).not.toBeChecked();
  });

  test('"Ver mais" expands property types', async ({ page }) => {
    const verMaisBtn = page.locator('.show-more-btn').first();
    await expect(verMaisBtn).toContainText('Ver mais');
    const countBefore = await page.locator('#tipo-imovel-section .checkbox-item').count().catch(() => 4);
    await verMaisBtn.click();
    await expect(verMaisBtn).toContainText('Ver menos');
  });

  test('Bairro search filters neighborhood list', async ({ page }) => {
    const searchInput = page.locator('.search-input');
    await searchInput.fill('Campeche');
    const items = page.locator('.checkbox-list.scrollable .checkbox-item');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(1);
    const firstLabel = await items.first().textContent();
    expect(firstLabel?.toLowerCase()).toContain('campeche');
  });

  test('selecting a bairro via checkbox works', async ({ page }) => {
    const searchInput = page.locator('.search-input');
    await searchInput.fill('Campeche');
    const campecheCheck = page.locator('.checkbox-list.scrollable .checkbox-item')
      .filter({ hasText: /^Campeche$/ })
      .locator('input');
    await campecheCheck.check();
    await expect(campecheCheck).toBeChecked();
  });

  test('collapsible sections open/close on click', async ({ page }) => {
    // Vagas is defaultOpen=false
    const vagasHeader = page.locator('.filter-section-header', { hasText: 'Vagas' });
    const vagasBody = vagasHeader.locator('..').locator('.filter-section-body');
    // Initially hidden (defaultOpen=false)
    await expect(vagasBody).not.toBeVisible();
    await vagasHeader.click();
    await expect(vagasBody).toBeVisible();
    await vagasHeader.click();
    await expect(vagasBody).not.toBeVisible();
  });

  test('Preço inputs accept numeric values', async ({ page }) => {
    const precoSection = page.locator('.filter-section', { hasText: 'Preço' });
    const minInput = precoSection.locator('input').first();
    const maxInput = precoSection.locator('input').last();
    await minInput.fill('500000');
    await maxInput.fill('2000000');
    await expect(minInput).toHaveValue('500000');
    await expect(maxInput).toHaveValue('2000000');
  });

  test('Limpar button resets filters', async ({ page }) => {
    // Set some filters
    const alugar = page.locator('.toggle-btn', { hasText: 'Alugar' });
    await alugar.click();
    await expect(alugar).toHaveClass(/active/);

    const limpar = page.locator('.btn-reset');
    await limpar.click();

    // Comprar should be active again
    const comprar = page.locator('.toggle-btn', { hasText: 'Comprar' });
    await expect(comprar).toHaveClass(/active/);
    await expect(alugar).not.toHaveClass(/active/);
  });
});

test.describe('Property display', () => {
  let seededCodes = [];

  test.beforeAll(async () => {
    await cleanTestData();
    const p1 = await seedProperty({
      code: 'TEST-001',
      title: 'Casa Teste Campeche',
      tipo: 'Casa',
      bairro: 'Campeche',
      preco_venda: 850000,
      quartos: 3,
      area_m2: 120,
    });
    const p2 = await seedProperty({
      code: 'TEST-002',
      title: 'Apartamento Lagoa',
      tipo: 'Apartamento',
      bairro: 'Lagoa da Conceição',
      preco_venda: 450000,
      quartos: 2,
      area_m2: 75,
      tags: JSON.stringify(['preco-baixou']),
    });
    const p3 = await seedProperty({
      code: 'TEST-003',
      title: 'Casa Exclusiva',
      tipo: 'Casa',
      bairro: 'Campeche',
      preco_venda: 1200000,
      quartos: 4,
      area_m2: 200,
      tags: JSON.stringify(['exclusivo']),
    });
    seededCodes = ['TEST-001', 'TEST-002', 'TEST-003'];
  });

  test.afterAll(async () => {
    await cleanTestData();
  });

  test('shows property cards after loading', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 10000 });
    // Wait for cards or empty state
    await page.waitForFunction(() => {
      return document.querySelector('.property-card:not(.skeleton)') !== null ||
             document.querySelector('.grid-empty') !== null;
    }, { timeout: 10000 });

    const cards = await page.locator('.property-card:not(.skeleton)').count();
    expect(cards).toBeGreaterThanOrEqual(1);
  });

  test('stats bar shows aggregate info when properties exist', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 10000 });
    await page.waitForFunction(() =>
      document.querySelector('.stats-bar') !== null, { timeout: 10000 }
    );
    const statsBar = page.locator('.stats-bar');
    await expect(statsBar).toBeVisible();
    // Should show count
    await expect(statsBar.locator('.stat-value').first()).not.toBeEmpty();
  });

  test('sort dropdown changes display order', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 10000 });
    await page.locator('.sort-select').waitFor({ timeout: 10000 });
    const select = page.locator('.sort-select');
    await select.selectOption('preco_desc');
    await expect(select).toHaveValue('preco_desc');
    await select.selectOption('area_desc');
    await expect(select).toHaveValue('area_desc');
  });

  test('property card shows price, location, and link', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 10000 });
    await page.locator('.property-card:not(.skeleton)').first().waitFor({ timeout: 10000 });
    const card = page.locator('.property-card:not(.skeleton)').first();
    // Should have a price element
    const priceEl = card.locator('.price-main, .price-sale');
    await expect(priceEl).not.toBeEmpty();
    // Should have a link to the listing
    const link = card.locator('.property-link');
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    expect(href).toBeTruthy();
  });

  test('tag chips render for tagged properties', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 10000 });
    await page.locator('.property-card:not(.skeleton)').first().waitFor({ timeout: 10000 });
    // At least one card with a tag should exist (we seeded tagged ones)
    const taggedCards = page.locator('.property-tag');
    const count = await taggedCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('empty state shows when no data matches filters', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 10000 });

    // Wait for cards to load first
    await page.locator('.property-card:not(.skeleton)').first().waitFor({ timeout: 10000 });
    // Set an impossible filter: 10+ million min price
    const precoSection = page.locator('.filter-section', { hasText: 'Preço' });
    const minInput = precoSection.locator('input').first();
    await minInput.click();
    await minInput.fill('');
    await minInput.pressSequentially('99999999');
    // Wait for empty state
    const emptyState = page.locator('.grid-empty');
    await expect(emptyState).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Extract modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 10000 });
  });

  test('opens extract modal when "Extrair dados" is clicked', async ({ page }) => {
    await page.locator('.btn-extract').click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('.modal-header h3')).toContainText('Extrair dados');
  });

  test('modal shows preview URL and BusyBase info', async ({ page }) => {
    await page.locator('.btn-extract').click();
    await expect(page.locator('.modal-url-link')).toBeVisible();
    await expect(page.locator('.modal-info')).toContainText('localhost:54321');
  });

  test('modal closes on Cancelar button', async ({ page }) => {
    await page.locator('.btn-extract').click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.locator('.btn-secondary', { hasText: 'Cancelar' }).click();
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
  });

  test('modal closes on X button', async ({ page }) => {
    await page.locator('.btn-extract').click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.locator('.modal-close').click();
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
  });

  test('modal closes on overlay backdrop click', async ({ page }) => {
    await page.locator('.btn-extract').click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.locator('.modal-overlay').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
  });
});

test.describe('Pagination', () => {
  test.beforeAll(async () => {
    // Seed 30 properties sequentially to avoid crashing BusyBase with concurrent writes
    await cleanTestData();
    for (let i = 1; i <= 30; i++) {
      await seedProperty({
        code: `TEST-${String(i).padStart(3, '0')}`,
        title: `Imóvel Teste ${i}`,
        preco_venda: 500000 + i * 10000,
      });
    }
  });

  test.afterAll(async () => {
    await cleanTestData();
  });

  test('pagination controls appear when more than 24 properties', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 10000 });
    await page.locator('.pagination').waitFor({ timeout: 10000 });
    const pagination = page.locator('.pagination');
    await expect(pagination).toBeVisible();
  });

  test('next page button navigates forward', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 10000 });
    await page.locator('.pagination').waitFor({ timeout: 10000 });
    const nextBtn = page.locator('.page-btn').last();
    await nextBtn.click();
    // Active page should now be 2
    const activePage = page.locator('.page-btn.active');
    await expect(activePage).toContainText('2');
  });

  test('previous page button is disabled on page 1', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 10000 });
    await page.locator('.pagination').waitFor({ timeout: 10000 });
    const prevBtn = page.locator('.page-btn').first();
    await expect(prevBtn).toBeDisabled();
  });
});
