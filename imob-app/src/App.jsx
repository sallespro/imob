import { useState, useEffect } from 'react';
import FilterPanel from './components/FilterPanel';
import PropertyGrid from './components/PropertyGrid';
import StatsBar from './components/StatsBar';
import ExtractModal from './components/ExtractModal';
import { DEFAULT_FILTERS } from './lib/constants';
import { db, initAuth, getProperties } from './lib/db';
import { parseHtmlListings, getTotalPagesFromHtml, buildSearchUrl } from './lib/scraper';
import './App.css';

export default function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [properties, setProperties] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [extractStatus, setExtractStatus] = useState('idle');
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);

  useEffect(() => {
    initAuth()
      .then(() => setDbReady(true))
      .catch(err => {
        console.warn('BusyBase not available:', err.message);
        setDbError('BusyBase não disponível. Inicie com: bunx busybase serve');
      });
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    loadProperties();
  }, [filters, dbReady]);

  async function loadProperties() {
    setIsLoading(true);
    try {
      const data = await getProperties(filters);
      setProperties(data);
    } catch (err) {
      console.error('Error loading properties:', err);
      setProperties([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function runExtraction() {
    setExtractStatus('running');
    try {
      const proxyPath = buildSearchUrl(filters, 1);
      const resp1 = await fetch(`/api-proxy${proxyPath}`);
      if (!resp1.ok) throw new Error(`HTTP ${resp1.status}`);
      const html1 = await resp1.text();

      const totalPages = filters.maxPages
        ? Math.min(parseInt(filters.maxPages), getTotalPagesFromHtml(html1))
        : getTotalPagesFromHtml(html1);

      console.log(`[Scraper] ${totalPages} pages`);
      let allListings = parseHtmlListings(html1);
      console.log(`[Scraper] Page 1: ${allListings.length}`);

      for (let page = 2; page <= totalPages; page++) {
        await new Promise(r => setTimeout(r, 700));
        const resp = await fetch(`/api-proxy${buildSearchUrl(filters, page)}`);
        if (!resp.ok) continue;
        const listings = parseHtmlListings(await resp.text());
        const newOnes = listings.filter(l => !allListings.some(e => e.code === l.code));
        allListings = [...allListings, ...newOnes];
        console.log(`[Scraper] Page ${page}/${totalPages}: total=${allListings.length}`);
      }

      // Save to BusyBase in batches of 50
      for (let i = 0; i < allListings.length; i += 50) {
        const { error } = await db.from('properties')
          .upsert(allListings.slice(i, i + 50), { onConflict: 'code' });
        if (error) throw error;
      }

      await db.from('scraper_runs').insert({
        filters: JSON.stringify(filters),
        total_found: allListings.length,
        ran_at: new Date().toISOString(),
      });

      setExtractStatus('done');
      await loadProperties();
    } catch (err) {
      console.error('[Scraper] Error:', err);
      setExtractStatus('error');
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <span className="header-logo">🏠</span>
          <h1>Imóveis Florianópolis</h1>
          <span className="header-sub">Auxiliadora Predial</span>
        </div>
        <div className="header-status">
          {dbError && <span className="db-error">⚠ {dbError}</span>}
          {dbReady && <span className="db-ok">✓ BusyBase</span>}
        </div>
      </header>

      <div className="app-layout">
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          onExtract={() => { setExtractStatus('idle'); setShowExtractModal(true); }}
          isExtracting={extractStatus === 'running'}
        />
        <main className="app-main">
          <StatsBar properties={properties} />
          <PropertyGrid
            properties={properties}
            filters={filters}
            onFiltersChange={setFilters}
            isLoading={isLoading}
          />
        </main>
      </div>

      {showExtractModal && (
        <ExtractModal
          filters={filters}
          status={extractStatus}
          onClose={() => { setShowExtractModal(false); setExtractStatus('idle'); }}
          onConfirm={runExtraction}
        />
      )}
    </div>
  );
}
