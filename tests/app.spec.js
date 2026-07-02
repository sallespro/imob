/**
 * End-to-end tests for the Imóveis Florianópolis app.
 * Requires servers running: npm run start
 *   API: http://localhost:3001
 *   App: http://localhost:5173
 */

import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:5173';
const API = 'http://localhost:3001';

async function waitForApi() {
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(`${API}/datasets`);
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('API not ready');
}

async function seedTestProperties() {
  const props = Array.from({ length: 3 }, (_, i) => ({
    code: `TEST-PW-${i + 1}`,
    url: `https://www.auxiliadorapredial.com.br/imovel/${i + 1}/`,
    tipo: i === 1 ? 'Apartamento' : 'Casa',
    bairro: i === 1 ? 'Lagoa da Conceição' : 'Campeche',
    cidade: 'Florianópolis',
    preco_venda: 500000 + i * 200000,
    area_m2: 80 + i * 40,
    quartos: 2 + i,
    banheiros: 2,
    vagas: 1,
    lat: -27.67 + i * 0.01,
    lng: -48.47 + i * 0.01,
    tags: i === 1 ? ['preco-baixou'] : [],
    features: ['Piscina'],
    scraped_at: new Date().toISOString(),
  }));
  const r = await fetch(`${API}/properties`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(props),
  });
  if (!r.ok) throw new Error(`Seed failed: ${r.status}`);
}

async function cleanTestProperties() {
  const r = await fetch(`${API}/properties`);
  const all = await r.json();
  const testRows = all.filter(p => p.code?.startsWith('TEST-PW-'));
  // No delete endpoint — just note they'll be upserted over
  return testRows.length;
}

// ─── App shell ────────────────────────────────────────────────────────────────

test.describe('App shell', () => {
  test('renders header and connects to API', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.locator('h1')).toContainText('Imóveis Florianópolis');
    await expect(page.locator('.db-ok')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.db-error')).not.toBeVisible();
  });

  test('shows Datasets button in header', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 15000 });
    await expect(page.locator('.btn-datasets')).toBeVisible();
  });
});

// ─── Filter panel ─────────────────────────────────────────────────────────────

test.describe('Filter panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 15000 });
    await page.locator('.toggle-btn').first().waitFor({ timeout: 10000 });
  });

  test('Transação toggles between Comprar and Alugar', async ({ page }) => {
    // Transação is in the Extração tab
    await page.locator('.filter-tab', { hasText: 'Extração' }).click();
    const alugar = page.locator('.filter-panel .toggle-btn', { hasText: 'Alugar' }).first();
    const comprar = page.locator('.filter-panel .toggle-btn', { hasText: 'Comprar' }).first();
    await expect(comprar).toHaveClass(/active/);
    await alugar.click();
    await expect(alugar).toHaveClass(/active/);
    await expect(comprar).not.toHaveClass(/active/);
  });

  test('Quartos toggle selects and deselects', async ({ page }) => {
    const quartosSection = page.locator('.filter-section').filter({
      has: page.locator('.filter-section-header', { hasText: 'Quartos' }),
    });
    const btn3 = quartosSection.locator('.toggle-btn', { hasText: '3+' });
    await btn3.click();
    await expect(btn3).toHaveClass(/active/);
    await btn3.click();
    await expect(btn3).not.toHaveClass(/active/);
  });

  test('Bairro search filters neighbourhood list', async ({ page }) => {
    // Bairros — Lista section is collapsed by default, open it first
    const bairroListHeader = page.locator('.filter-section-header', { hasText: 'Bairros — Lista' });
    await bairroListHeader.click();
    await page.locator('.search-input').waitFor({ timeout: 5000 });
    await page.locator('.search-input').fill('Campeche');
    const items = page.locator('.checkbox-list.scrollable .checkbox-item');
    await expect(items.first()).toContainText(/campeche/i);
  });

  test('Limpar resets filters', async ({ page }) => {
    await page.locator('.filter-tab', { hasText: 'Extração' }).click();
    await page.locator('.filter-panel .toggle-btn', { hasText: 'Alugar' }).first().click();
    await page.locator('.btn-reset').click();
    await page.locator('.filter-tab', { hasText: 'Extração' }).click();
    await expect(page.locator('.filter-panel .toggle-btn', { hasText: 'Comprar' }).first()).toHaveClass(/active/);
  });

  test('collapsible section opens and closes', async ({ page }) => {
    const vagasHeader = page.locator('.filter-section-header', { hasText: 'Vagas' });
    const vagasBody = vagasHeader.locator('..').locator('.filter-section-body');
    await expect(vagasBody).not.toBeVisible();
    await vagasHeader.click();
    await expect(vagasBody).toBeVisible();
    await vagasHeader.click();
    await expect(vagasBody).not.toBeVisible();
  });
});

// ─── Property display ─────────────────────────────────────────────────────────

test.describe('Property display', () => {
  test.beforeAll(async () => {
    await waitForApi();
    await seedTestProperties();
  });

  test('property cards render with price and link', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 15000 });
    await page.locator('.property-card:not(.skeleton)').first().waitFor({ timeout: 10000 });
    const card = page.locator('.property-card:not(.skeleton)').first();
    await expect(card.locator('.price-main').first()).not.toBeEmpty();
    const link = card.locator('a[href*="auxiliadorapredial"]');
    await expect(link).toBeVisible();
  });

  test('stats bar shows count', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 15000 });
    await expect(page.locator('.stats-bar')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.stat-value').first()).not.toBeEmpty();
  });

  test('sort dropdown works', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 15000 });
    await page.locator('.sort-select').waitFor({ timeout: 10000 });
    await page.locator('.sort-select').selectOption('preco_desc');
    await expect(page.locator('.sort-select')).toHaveValue('preco_desc');
  });

  test('impossible price filter shows empty state', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 15000 });
    await page.locator('.property-card:not(.skeleton)').first().waitFor({ timeout: 10000 });
    const minInput = page.locator('.filter-section', { hasText: 'Preço' }).locator('input').first();
    await minInput.fill('999999999');
    await expect(page.locator('.grid-empty')).toBeVisible({ timeout: 8000 });
  });
});

// ─── Dataset manager ─────────────────────────────────────────────────────────

test.describe('Dataset manager', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 15000 });
  });

  test('opens and closes dataset panel', async ({ page }) => {
    await page.locator('.btn-datasets').click();
    await expect(page.locator('.dataset-manager')).toBeVisible();
    await page.locator('.dataset-manager-close').click();
    await expect(page.locator('.dataset-manager')).not.toBeVisible();
  });

  test('active dataset is shown', async ({ page }) => {
    await page.locator('.btn-datasets').click();
    await expect(page.locator('.dataset-active-badge')).toBeVisible();
  });

  test('create and delete a dataset', async ({ page }) => {
    await page.locator('.btn-datasets').click();
    await page.locator('.dataset-input').first().fill('pw-test-ds');
    await page.locator('.btn-create').click();
    await expect(page.locator('.dataset-row', { hasText: 'pw-test-ds' })).toBeVisible({ timeout: 5000 });
    // Delete it — handle the confirm dialog
    page.on('dialog', d => d.accept());
    await page.locator('.dataset-row', { hasText: 'pw-test-ds' }).locator('.btn-delete').click();
    await expect(page.locator('.dataset-row', { hasText: 'pw-test-ds' })).not.toBeVisible({ timeout: 5000 });
  });
});

// ─── Extract modal + real scrape ──────────────────────────────────────────────

test.describe('Extrair dados', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 15000 });
  });

  test('extract modal opens, shows URL, and cancels', async ({ page }) => {
    await page.locator('.btn-extract').click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('.modal-header h3')).toContainText('Extrair dados');
    await expect(page.locator('.modal-url-link')).toBeVisible();
    await page.locator('.btn-secondary', { hasText: 'Cancelar' }).click();
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
  });

  test('modal closes on backdrop click', async ({ page }) => {
    await page.locator('.btn-extract').click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.locator('.modal-overlay').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
  });

  test('real scrape: 1-page extraction completes and shows done', async ({ page }) => {
    await page.locator('.toggle-btn').first().waitFor({ timeout: 10000 });

    // Switch to Extração tab, select Campeche bairro, and limit to 1 page
    await page.locator('.filter-tab', { hasText: 'Extração' }).click();
    await page.locator('.filter-section-header', { hasText: 'Bairros — Lista' }).click();
    await page.locator('.search-input').waitFor({ timeout: 5000 });
    await page.locator('.search-input').fill('Campeche');
    const campecheItem = page.locator('.checkbox-list.scrollable .checkbox-item')
      .filter({ hasText: 'Campeche' }).first();
    await campecheItem.waitFor({ timeout: 5000 });
    await campecheItem.locator('input').check();

    // Set maxPages to 1 for a fast test (open collapsed Paginação section)
    await page.locator('.filter-section-header', { hasText: 'Paginação' }).click();
    await page.locator('input[placeholder="Todas"]').waitFor({ timeout: 3000 });
    await page.locator('input[placeholder="Todas"]').fill('1');

    await page.locator('.btn-extract').click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.locator('.btn-primary', { hasText: 'Iniciar extração' }).click();

    // Should show running spinner
    await expect(page.locator('.modal-progress')).toBeVisible({ timeout: 10000 });

    // Wait for completion — 1-page scrape takes ~30-60s
    await expect(page.locator('.modal-progress')).toContainText('concluída', { timeout: 120000 });

    // Verify properties are in the DB via API
    const datasets = await page.evaluate(async () => {
      const res = await fetch('http://localhost:3001/datasets');
      return res.json();
    });
    const active = datasets.find(d => d.count > 0);
    expect(active).toBeTruthy();
    expect(active.count).toBeGreaterThan(0);
  });
});

// ─── Pagination ───────────────────────────────────────────────────────────────

test.describe('Pagination', () => {
  test.beforeAll(async () => {
    await waitForApi();
    // Seed 30 properties so pagination kicks in (page size = 24)
    const props = Array.from({ length: 30 }, (_, i) => ({
      code: `TEST-PW-PAGE-${i + 1}`,
      url: `https://www.auxiliadorapredial.com.br/imovel/page-${i + 1}/`,
      tipo: 'Casa',
      bairro: 'Campeche',
      cidade: 'Florianópolis',
      preco_venda: 400000 + i * 10000,
      area_m2: 80,
      quartos: 3,
      banheiros: 2,
      vagas: 1,
      lat: -27.67,
      lng: -48.47,
      tags: [],
      features: [],
      scraped_at: new Date().toISOString(),
    }));
    await fetch(`${API}/properties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(props),
    });
  });

  test('pagination controls appear with 30+ properties', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 15000 });
    await expect(page.locator('.pagination')).toBeVisible({ timeout: 10000 });
  });

  test('next page button navigates forward', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 15000 });
    await page.locator('.pagination').waitFor({ timeout: 10000 });
    await page.locator('.page-btn').last().click();
    await expect(page.locator('.page-btn.active')).toContainText('2');
  });

  test('previous button is disabled on page 1', async ({ page }) => {
    await page.goto(APP_URL);
    await page.locator('.db-ok').waitFor({ timeout: 15000 });
    await page.locator('.pagination').waitFor({ timeout: 10000 });
    await expect(page.locator('.page-btn').first()).toBeDisabled();
  });
});
