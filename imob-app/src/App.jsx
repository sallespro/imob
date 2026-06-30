import { useState, useEffect, useRef } from 'react';
import FilterPanel from './components/FilterPanel';
import PropertyGrid from './components/PropertyGrid';
import StatsBar from './components/StatsBar';
import VizDrawer from './components/VizDrawer';
import ExtractModal from './components/ExtractModal';
import { DEFAULT_FILTERS } from './lib/constants';
import { initAuth, getProperties, applyViewFilters } from './lib/db';
import { buildExternalUrl } from './lib/scraper';
import './App.css';

export default function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [allProperties, setAllProperties] = useState([]); // all from DB, unfiltered
  const [properties, setProperties] = useState([]);       // filtered view
  const [isLoading, setIsLoading] = useState(false);
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [extractStatus, setExtractStatus] = useState('idle');
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [seedStatus, setSeedStatus] = useState('idle'); // 'idle' | 'running' | 'done' | 'error'
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    initAuth()
      .then(() => setDbReady(true))
      .catch(err => {
        console.warn('BusyBase not available:', err.message);
        setDbError('BusyBase não disponível. Inicie com: npm run start');
      });

    // Poll seed status on startup
    const pollSeed = setInterval(async () => {
      try {
        const r = await fetch('http://localhost:3001/seed/status');
        const s = await r.json();
        if (s.running) {
          setSeedStatus('running');
        } else if (s.exitCode === 0) {
          setSeedStatus('done');
          clearInterval(pollSeed);
          // Reload data after seed completes
          setTimeout(() => loadAllProperties(), 500);
        } else if (s.exitCode !== null) {
          setSeedStatus('error');
          clearInterval(pollSeed);
        } else {
          setSeedStatus('idle');
        }
      } catch {}
    }, 2000);
    return () => clearInterval(pollSeed);
  }, []);

  // Load all data once on init and after extraction
  useEffect(() => {
    if (!dbReady) return;
    loadAllProperties();
  }, [dbReady]);

  // Apply view filters client-side whenever filters or allProperties change
  useEffect(() => {
    setProperties(applyViewFilters(allProperties, filters));
  }, [filters, allProperties]);

  async function loadAllProperties() {
    setIsLoading(true);
    try {
      const data = await getProperties(); // loads all, no filters
      setAllProperties(data);
    } catch (err) {
      console.error('Error loading properties:', err);
      setAllProperties([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function runExtraction() {
    setExtractStatus('running');
    try {
      const f = filtersRef.current;
      const resp = await fetch('http://localhost:3001/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transacao: f.transacao,
          categoria: f.categoria,
          cidade: f.cidade || 'sc+florianopolis',
          bairro: f.bairro || [],
          quartos: f.quartos || null,
          tipoImovel: f.tipoImovel || [],
          precoMin: f.precoMin || null,
          precoMax: f.precoMax || null,
          vagas: f.vagas ?? null,
          banheiros: f.banheiros || null,
          areaMin: f.areaMin || null,
          areaMax: f.areaMax || null,
          maxPages: f.maxPages ? parseInt(f.maxPages) : null,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      console.log('[Scraper] Scrape job started — check terminal for progress');

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
              if (status.exitCode !== null && status.exitCode !== 0) {
                reject(new Error(status.log?.slice(-3).join(' | ') || `Scraper exited with code ${status.exitCode}`));
              } else {
                resolve();
              }
            }
          } catch (e) {
            clearInterval(interval);
            reject(e);
          }
        }, 3000);
      });

      setExtractStatus('done');
      // Reload all data from DB after extraction
      await loadAllProperties();
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
          {dbReady && (
            <span className="db-ok">
              ✓ BusyBase {allProperties.length > 0 && `· ${allProperties.length} imóveis`}
            </span>
          )}
          {seedStatus === 'running' && (
            <span className="seed-status running">Seed em andamento...</span>
          )}
          {seedStatus === 'error' && (
            <span className="seed-status error">Seed falhou</span>
          )}
          <button
            className="btn-reseed"
            title="Re-seed: limpar DB e re-extrair dataset padrão (Campeche, 3+ quartos)"
            disabled={seedStatus === 'running' || extractStatus === 'running'}
            onClick={async () => {
              if (!confirm('Limpar DB e re-extrair dataset padrão (Campeche, 3+ quartos)?')) return;
              setSeedStatus('running');
              try {
                await fetch('http://localhost:3001/seed/force', { method: 'POST' });
              } catch (e) {
                setSeedStatus('error');
              }
            }}
          >
            Re-seed
          </button>
        </div>
      </header>

      <div className="app-layout">
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          onExtract={() => { setExtractStatus('idle'); setShowExtractModal(true); }}
          isExtracting={extractStatus === 'running'}
          allProperties={allProperties}
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
        <VizDrawer properties={properties} />
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
