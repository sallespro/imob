import { useState } from 'react';
import { BarChart2, X } from 'lucide-react';
import DataVizPanel from './DataVizPanel';

export default function VizDrawer({ properties }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={`viz-drawer-toggle ${open ? 'active' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="Visualizações"
      >
        <BarChart2 size={16} />
        <span>Gráficos</span>
        {properties.length > 0 && (
          <span className="viz-drawer-count">{properties.length}</span>
        )}
      </button>

      <div className={`viz-drawer ${open ? 'open' : ''}`}>
        <div className="viz-drawer-header">
          <span>Visualizações</span>
          <button className="viz-drawer-close" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <div className="viz-drawer-body">
          {properties.length > 0 ? (
            <DataVizPanel properties={properties} />
          ) : (
            <p className="viz-drawer-empty">Nenhum imóvel encontrado com os filtros atuais.</p>
          )}
        </div>
      </div>

      {open && <div className="viz-drawer-backdrop" onClick={() => setOpen(false)} />}
    </>
  );
}
