import { X } from 'lucide-react';

// Compact inline filter bar shown above the property grid
export default function QuickFilters({ filters, onChange, properties }) {
  const set = (key, val) => onChange({ ...filters, [key]: val, page: 1 });
  const active = countActive(filters);

  // Compute tipo options from visible data
  const tipoCounts = {};
  properties.forEach(p => { if (p.tipo) tipoCounts[p.tipo] = (tipoCounts[p.tipo] || 0) + 1; });
  const topTipos = Object.entries(tipoCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  return (
    <div className="quick-filters">
      <div className="qf-row">

        {/* Quartos */}
        <div className="qf-group">
          <span className="qf-label">Quartos</span>
          {['1', '2', '3', '4'].map(v => (
            <button
              key={v}
              className={`qf-chip ${filters.quartos === v ? 'active' : ''}`}
              onClick={() => set('quartos', filters.quartos === v ? '' : v)}
            >
              {v}+
            </button>
          ))}
        </div>

        <div className="qf-divider" />

        {/* Vagas */}
        <div className="qf-group">
          <span className="qf-label">Vagas</span>
          {['0', '1', '2', '3'].map(v => (
            <button
              key={v}
              className={`qf-chip ${filters.vagas === v ? 'active' : ''}`}
              onClick={() => set('vagas', filters.vagas === v ? '' : v)}
            >
              {v === '0' ? 'Sem' : `${v}+`}
            </button>
          ))}
        </div>

        <div className="qf-divider" />

        {/* Price range presets */}
        <div className="qf-group">
          <span className="qf-label">Preço</span>
          {[
            { label: 'até 1M',    max: 1000000,  min: '' },
            { label: '1–2M',      max: 2000000,  min: 1000000 },
            { label: '2–5M',      max: 5000000,  min: 2000000 },
            { label: '5M+',       max: '',        min: 5000000 },
          ].map(p => {
            const isActive = String(filters.precoMin) === String(p.min) && String(filters.precoMax) === String(p.max);
            return (
              <button
                key={p.label}
                className={`qf-chip ${isActive ? 'active' : ''}`}
                onClick={() => {
                  if (isActive) {
                    onChange({ ...filters, precoMin: '', precoMax: '', page: 1 });
                  } else {
                    onChange({ ...filters, precoMin: p.min, precoMax: p.max, page: 1 });
                  }
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="qf-divider" />

        {/* Top tipos from current data */}
        <div className="qf-group">
          <span className="qf-label">Tipo</span>
          {topTipos.map(t => {
            const isActive = (filters.tipoImovel || []).includes(t);
            return (
              <button
                key={t}
                className={`qf-chip ${isActive ? 'active' : ''}`}
                onClick={() => {
                  const cur = filters.tipoImovel || [];
                  set('tipoImovel', isActive ? cur.filter(x => x !== t) : [...cur, t]);
                }}
              >
                {shortTipo(t)}
                <span className="qf-count">{tipoCounts[t]}</span>
              </button>
            );
          })}
        </div>

        {/* Clear active filters */}
        {active > 0 && (
          <>
            <div className="qf-divider" />
            <button
              className="qf-clear"
              onClick={() => onChange({
                ...filters,
                quartos: '', vagas: '', precoMin: '', precoMax: '',
                tipoImovel: [], banheiros: '', areaMin: '', areaMax: '',
                comodidades: [], tags: [], exclusivo: false, mobiliado: '',
                page: 1,
              })}
            >
              <X size={12} /> Limpar ({active})
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function shortTipo(t) {
  const map = {
    'Casa Em Condominio': 'Cond.',
    'Casa em condomínio': 'Cond.',
    'Cobertura Horizontal': 'Cob.H.',
    'Cobertura': 'Cob.',
    'Apartamento': 'Apto',
    'Casa Geminada': 'Gem.',
  };
  return map[t] || t;
}

function countActive(f) {
  let n = 0;
  if (f.quartos) n++;
  if (f.vagas !== '' && f.vagas != null) n++;
  if (f.precoMin || f.precoMax) n++;
  if ((f.tipoImovel || []).length) n++;
  if (f.banheiros) n++;
  if (f.areaMin || f.areaMax) n++;
  if ((f.comodidades || []).length) n++;
  if ((f.tags || []).length) n++;
  if (f.exclusivo) n++;
  if (f.mobiliado) n++;
  return n;
}
