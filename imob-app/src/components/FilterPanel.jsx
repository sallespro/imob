import { useState } from 'react';
import { RotateCcw, Search, ChevronDown, ChevronUp, Database, Eye } from 'lucide-react';
import { PROPERTY_TYPES, AMENITIES, NEIGHBORHOODS_FLORIANOPOLIS, DEFAULT_FILTERS } from '../lib/constants';
import BairroMap from './BairroMap';

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="filter-section">
      <button className="filter-section-header" onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div className="filter-section-body">{children}</div>}
    </div>
  );
}

function ToggleGroup({ options, value, onChange, multi = false }) {
  const active = Array.isArray(value) ? value : (value ? [value] : []);
  return (
    <div className="toggle-group">
      {options.map(opt => {
        const v = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        const isActive = active.includes(v);
        return (
          <button
            key={v}
            className={`toggle-btn ${isActive ? 'active' : ''}`}
            onClick={() => {
              if (multi) {
                onChange(isActive ? active.filter(x => x !== v) : [...active, v]);
              } else {
                onChange(isActive ? '' : v);
              }
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function FilterPanel({
  filters,
  onChange,
  onExtract,
  isExtracting,
  allProperties,
}) {
  const [tab, setTab] = useState('view'); // 'view' | 'extract'
  const [bairroSearch, setBairroSearch] = useState('');

  const set = (key, val) => onChange({ ...filters, [key]: val, page: 1 });

  const filteredNeighborhoods = NEIGHBORHOODS_FLORIANOPOLIS.filter(b =>
    b.toLowerCase().includes(bairroSearch.toLowerCase())
  );

  // Build bairro counts from all loaded DB properties (unfiltered)
  const bairroCounts = {};
  (allProperties || []).forEach(p => {
    if (p.bairro) bairroCounts[p.bairro] = (bairroCounts[p.bairro] || 0) + 1;
  });

  const toggleBairro = (name) => {
    const current = filters.bairro || [];
    const next = current.includes(name)
      ? current.filter(b => b !== name)
      : [...current, name];
    set('bairro', next);
  };

  const sharedBairroSection = (
    <>
      <Section title="Bairros — Mapa" defaultOpen={true}>
        <BairroMap
          selectedBairros={filters.bairro || []}
          onToggleBairro={toggleBairro}
          propertyCounts={bairroCounts}
          totalCount={(allProperties || []).length}
        />
        {(filters.bairro || []).length > 0 && (
          <div className="bairro-chips">
            {filters.bairro.map(b => (
              <span key={b} className="bairro-chip">
                {b}
                <button onClick={() => toggleBairro(b)}>×</button>
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Bairros — Lista" defaultOpen={false}>
        <input
          className="search-input"
          placeholder="Buscar bairro..."
          value={bairroSearch}
          onChange={e => setBairroSearch(e.target.value)}
        />
        <div className="checkbox-list scrollable">
          {filteredNeighborhoods.map(b => (
            <label key={b} className="checkbox-item">
              <input
                type="checkbox"
                checked={(filters.bairro || []).includes(b)}
                onChange={() => toggleBairro(b)}
              />
              <span>{b}</span>
              {bairroCounts[b] > 0 && (
                <span className="bairro-count">{bairroCounts[b]}</span>
              )}
            </label>
          ))}
        </div>
      </Section>
    </>
  );

  return (
    <aside className="filter-panel">
      <div className="filter-panel-top">
        <h2 className="filter-panel-title">Filtros</h2>
        <div className="filter-actions">
          <button className="btn-reset" onClick={() => onChange({ ...DEFAULT_FILTERS })}>
            <RotateCcw size={14} /> Limpar
          </button>
          <button
            className="btn-extract"
            onClick={onExtract}
            disabled={isExtracting}
          >
            <Search size={14} />
            {isExtracting ? 'Extraindo...' : 'Extrair dados'}
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="filter-tabs">
        <button
          className={`filter-tab ${tab === 'view' ? 'active' : ''}`}
          onClick={() => setTab('view')}
        >
          <Eye size={13} /> Visualização
        </button>
        <button
          className={`filter-tab ${tab === 'extract' ? 'active' : ''}`}
          onClick={() => setTab('extract')}
        >
          <Database size={13} /> Extração
        </button>
      </div>

      <div className="filter-panel-body">
        {tab === 'view' && (
          <>
            <div className="filter-tab-hint">
              Filtra os imóveis já extraídos no banco local.
            </div>

            {sharedBairroSection}

            <Section title="Quartos">
              <ToggleGroup
                options={[
                  { value: '1', label: '1+' },
                  { value: '2', label: '2+' },
                  { value: '3', label: '3+' },
                  { value: '4', label: '4+' },
                ]}
                value={filters.quartos}
                onChange={v => set('quartos', v)}
              />
            </Section>

            <Section title="Tipo de Imóvel">
              <ToggleGroup
                options={PROPERTY_TYPES.map(t => ({ value: t, label: t }))}
                value={filters.tipoImovel || []}
                onChange={v => set('tipoImovel', v)}
                multi={true}
              />
            </Section>

            <Section title="Preço (R$)">
              <div className="price-range">
                <div className="input-group">
                  <label>Mínimo</label>
                  <input type="number" placeholder="0" value={filters.precoMin} onChange={e => set('precoMin', e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Máximo</label>
                  <input type="number" placeholder="Sem limite" value={filters.precoMax} onChange={e => set('precoMax', e.target.value)} />
                </div>
              </div>
            </Section>

            <Section title="Área (m²)" defaultOpen={false}>
              <div className="price-range">
                <div className="input-group">
                  <label>Mínimo</label>
                  <input type="number" placeholder="0" value={filters.areaMin} onChange={e => set('areaMin', e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Máximo</label>
                  <input type="number" placeholder="1000" value={filters.areaMax} onChange={e => set('areaMax', e.target.value)} />
                </div>
              </div>
            </Section>

            <Section title="Vagas" defaultOpen={false}>
              <ToggleGroup
                options={[
                  { value: '0', label: 'Sem' },
                  { value: '1', label: '1+' },
                  { value: '2', label: '2+' },
                  { value: '3', label: '3+' },
                ]}
                value={filters.vagas}
                onChange={v => set('vagas', v)}
              />
            </Section>

            <Section title="Banheiros" defaultOpen={false}>
              <ToggleGroup
                options={[
                  { value: '1', label: '1+' },
                  { value: '2', label: '2+' },
                  { value: '3', label: '3+' },
                  { value: '4', label: '4+' },
                ]}
                value={filters.banheiros}
                onChange={v => set('banheiros', v)}
              />
            </Section>

            <Section title="Mobiliado" defaultOpen={false}>
              <ToggleGroup
                options={[
                  { value: 'Sim', label: 'Sim' },
                  { value: 'Semi', label: 'Semi' },
                ]}
                value={filters.mobiliado}
                onChange={v => set('mobiliado', v)}
              />
            </Section>

            <Section title="Destaques" defaultOpen={false}>
              <div className="checkbox-list">
                <label className="checkbox-item">
                  <input type="checkbox" checked={filters.exclusivo} onChange={e => set('exclusivo', e.target.checked)} />
                  <span>Exclusivo</span>
                </label>
                <label className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={(filters.tags || []).includes('preco-baixou')}
                    onChange={e => {
                      const next = e.target.checked
                        ? [...(filters.tags || []), 'preco-baixou']
                        : (filters.tags || []).filter(t => t !== 'preco-baixou');
                      set('tags', next);
                    }}
                  />
                  <span>Baixou o preço</span>
                </label>
                <label className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={(filters.tags || []).includes('novo')}
                    onChange={e => {
                      const next = e.target.checked
                        ? [...(filters.tags || []), 'novo']
                        : (filters.tags || []).filter(t => t !== 'novo');
                      set('tags', next);
                    }}
                  />
                  <span>Anúncio Novo</span>
                </label>
              </div>
            </Section>

            <Section title="Comodidades" defaultOpen={false}>
              <ToggleGroup
                options={AMENITIES.map(a => ({ value: a.value, label: a.label }))}
                value={filters.comodidades || []}
                onChange={v => set('comodidades', v)}
                multi={true}
              />
            </Section>
          </>
        )}

        {tab === 'extract' && (
          <>
            <div className="filter-tab-hint">
              Define o que será buscado no site da Auxiliadora Predial.
            </div>

            <Section title="Transação">
              <ToggleGroup
                options={[
                  { value: 'comprar', label: 'Comprar' },
                  { value: 'alugar', label: 'Alugar' },
                ]}
                value={filters.transacao}
                onChange={v => set('transacao', v || 'comprar')}
              />
            </Section>

            <Section title="Categoria">
              <ToggleGroup
                options={[
                  { value: 'residencial', label: 'Residencial' },
                  { value: 'comercial', label: 'Comercial' },
                ]}
                value={filters.categoria}
                onChange={v => set('categoria', v || 'residencial')}
              />
            </Section>

            {sharedBairroSection}

            <Section title="Quartos (mínimo)">
              <ToggleGroup
                options={[
                  { value: '1', label: '1+' },
                  { value: '2', label: '2+' },
                  { value: '3', label: '3+' },
                  { value: '4', label: '4+' },
                ]}
                value={filters.quartos}
                onChange={v => set('quartos', v)}
              />
            </Section>

            <Section title="Preço (R$)">
              <div className="price-range">
                <div className="input-group">
                  <label>Mínimo</label>
                  <input type="number" placeholder="0" value={filters.precoMin} onChange={e => set('precoMin', e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Máximo</label>
                  <input type="number" placeholder="Sem limite" value={filters.precoMax} onChange={e => set('precoMax', e.target.value)} />
                </div>
              </div>
            </Section>

            <Section title="Área (m²)" defaultOpen={false}>
              <div className="price-range">
                <div className="input-group">
                  <label>Mínimo</label>
                  <input type="number" placeholder="0" value={filters.areaMin} onChange={e => set('areaMin', e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Máximo</label>
                  <input type="number" placeholder="1000" value={filters.areaMax} onChange={e => set('areaMax', e.target.value)} />
                </div>
              </div>
            </Section>

            <Section title="Vagas" defaultOpen={false}>
              <ToggleGroup
                options={[
                  { value: '1', label: '1+' },
                  { value: '2', label: '2+' },
                  { value: '3', label: '3+' },
                ]}
                value={filters.vagas}
                onChange={v => set('vagas', v)}
              />
            </Section>

            <Section title="Paginação" defaultOpen={false}>
              <div className="input-group">
                <label>Máximo de páginas a extrair</label>
                <input
                  type="number"
                  placeholder="Todas"
                  min="1"
                  value={filters.maxPages}
                  onChange={e => set('maxPages', e.target.value)}
                />
              </div>
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}
