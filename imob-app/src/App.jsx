import { useState, useEffect, useRef } from 'react';
import FilterPanel from './components/FilterPanel';
import PropertyGrid from './components/PropertyGrid';
import StatsBar from './components/StatsBar';
import VizDrawer from './components/VizDrawer';
import ExtractModal from './components/ExtractModal';
import DatasetManager from './components/DatasetManager';
import { DEFAULT_FILTERS } from './lib/constants';
import { initAuth, getProperties, applyViewFilters, listDatasets, getActiveDataset, switchDataset } from './lib/db';
import { buildExternalUrl } from './lib/scraper';
import './App.css';

export default function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [allProperties, setAllProperties] = useState([]);
  const [properties, setProperties] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [showDatasets, setShowDatasets] = useState(false);
  const [extractStatus, setExtractStatus] = useState('idle');
  const [apiReady, setApiReady] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [scrapeStatus, setScrapeStatus] = useState({ running: false });
  const [activeDataset, setActiveDataset] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const scrapeStartedRef = useRef(false);

  useEffect(() => {
    // Wait for the API server to be ready
    let attempts = 0;
    const tryConnect = async () => {
      try {
        await initAuth();
        setApiReady(true);
        setApiError(null);
        refreshDatasets();
      } catch {
        attempts++;
        if (attempts < 20) setTimeout(tryConnect, 1500);
        else setApiError('API não disponível. Inicie com: npm run start');
      }
    };
    tryConnect();
  }, []);

  useEffect(() => {
    if (!apiReady) return;
    loadAllProperties();
  }, [apiReady]);

  useEffect(() => {
    setProperties(applyViewFilters(allProperties, filters));
  }, [filters, allProperties]);

  // Poll scraper status while running
  useEffect(() => {
    if (!apiReady) return;
    let interval;
    const poll = async () => {
      try {
        const r = await fetch('http://localhost:3001/scrape/status');
        const s = await r.json();
        setScrapeStatus(s);
        if (s.running) scrapeStartedRef.current = true;
        if (!s.running && scrapeStartedRef.current && extractStatus === 'running') {
          scrapeStartedRef.current = false;
          if (s.exitCode === 0 || s.exitCode === null) {
            setExtractStatus('done');
          } else {
            setExtractStatus('error');
          }
          await loadAllProperties();
          await refreshDatasets();
        }
      } catch {}
    };
    poll();
    interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [apiReady, extractStatus]);

  async function refreshDatasets() {
    try {
      const [ds, active] = await Promise.all([listDatasets(), getActiveDataset()]);
      setDatasets(ds);
      setActiveDataset(active);
    } catch {}
  }

  async function loadAllProperties() {
    setIsLoading(true);
    try {
      const data = await getProperties();
      setAllProperties(data);
    } catch (err) {
      console.error('Error loading properties:', err);
      setAllProperties([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSwitchDataset(name) {
    try {
      await switchDataset(name);
      await refreshDatasets();
      await loadAllProperties();
    } catch (err) {
      console.error('Switch dataset error:', err);
    }
  }

  async function runExtraction(opts = {}) {
    setExtractStatus('running');
    scrapeStartedRef.current = false;
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
          ...opts,
        }),
      });

      if (resp.status === 409) {
        // Already running — treat as started, poll will catch completion
        scrapeStartedRef.current = true;
        return;
      }
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      scrapeStartedRef.current = true;
    } catch (err) {
      console.error('[Scraper] Error:', err);
      setExtractStatus('error');
    }
  }

  const statusText = apiError
    ? apiError
    : !apiReady
    ? 'Conectando...'
    : scrapeStatus.running
    ? `Extraindo (${scrapeStatus.dataset || activeDataset?.name || '...'})...`
    : activeDataset
    ? `${activeDataset.label || activeDataset.name} · ${activeDataset.count} imóveis`
    : null;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <span className="header-logo">🏠</span>
          <h1>Imóveis Florianópolis</h1>
          <span className="header-sub">Auxiliadora Predial</span>
        </div>
        <div className="header-status">
          {apiError && <span className="db-error">⚠ {apiError}</span>}
          {statusText && !apiError && (
            <span className={`db-ok ${scrapeStatus.running ? 'running' : ''}`}>
              {scrapeStatus.running ? '⏳ ' : '✓ '}{statusText}
            </span>
          )}
          <button
            className="btn-datasets"
            onClick={() => setShowDatasets(v => !v)}
            title="Gerenciar datasets"
          >
            Datasets {datasets.length > 0 && `(${datasets.length})`}
          </button>
        </div>
      </header>

      {showDatasets && (
        <DatasetManager
          datasets={datasets}
          activeDataset={activeDataset}
          scrapeRunning={scrapeStatus.running}
          onSwitch={handleSwitchDataset}
          onRefresh={refreshDatasets}
          onClose={() => setShowDatasets(false)}
          onScrapeNew={(opts) => {
            setShowDatasets(false);
            setShowExtractModal(true);
            // store dataset target for runExtraction
            filtersRef._datasetOpts = opts;
          }}
        />
      )}

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
          onConfirm={(opts) => runExtraction({ ...(opts || {}), ...(filtersRef._datasetOpts || {}) })}
        />
      )}
    </div>
  );
}
