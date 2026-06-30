import { useState, useEffect } from 'react';
import FilterPanel from './components/FilterPanel';
import PropertyGrid from './components/PropertyGrid';
import StatsBar from './components/StatsBar';
import ExtractModal from './components/ExtractModal';
import { DEFAULT_FILTERS } from './lib/constants';
import { initAuth, getProperties } from './lib/db';
import { buildExternalUrl } from './lib/scraper';
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
      // Trigger the Playwright scraper via local scrape-server (port 3001)
      const resp = await fetch('http://localhost:3001/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transacao: filters.transacao,
          categoria: filters.categoria,
          cidade: filters.cidade || 'sc+florianopolis',
          bairro: filters.bairro || [],
          quartos: filters.quartos || null,
          tipoImovel: filters.tipoImovel || [],
          precoMin: filters.precoMin || null,
          precoMax: filters.precoMax || null,
          vagas: filters.vagas ?? null,
          banheiros: filters.banheiros || null,
          areaMin: filters.areaMin || null,
          areaMax: filters.areaMax || null,
          maxPages: filters.maxPages ? parseInt(filters.maxPages) : null,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      console.log('[Scraper] Scrape job started — check terminal for progress');

      // Poll status until done
      await new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const statusResp = await fetch('http://localhost:3001/scrape/status');
            const status = await statusResp.json();
            if (status.log?.length) {
              console.log('[Scraper]', status.log[status.log.length - 1]);
            }
            if (!status.running) {
              clearInterval(interval);
              resolve();
            }
          } catch (e) {
            clearInterval(interval);
            reject(e);
          }
        }, 3000);
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
