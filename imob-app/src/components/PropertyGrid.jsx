import { ChevronLeft, ChevronRight } from 'lucide-react';
import PropertyCard from './PropertyCard';
import { SORT_OPTIONS } from '../lib/constants';

const PAGE_SIZE = 24;

export default function PropertyGrid({ properties, filters, onFiltersChange, isLoading }) {
  const page = filters.page || 1;

  // Sort
  const sorted = [...properties].sort((a, b) => {
    switch (filters.sort) {
      case 'preco_desc': return (b.preco_venda || 0) - (a.preco_venda || 0);
      case 'area_desc': return (b.area_m2 || 0) - (a.area_m2 || 0);
      case 'area_asc': return (a.area_m2 || 0) - (b.area_m2 || 0);
      case 'quartos_desc': return (b.quartos || 0) - (a.quartos || 0);
      case 'recente': return new Date(b.scraped_at) - new Date(a.scraped_at);
      default: return (a.preco_venda || Infinity) - (b.preco_venda || Infinity);
    }
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const setPage = p => onFiltersChange({ ...filters, page: p });

  if (isLoading) {
    return (
      <div className="grid-loading">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="property-card skeleton" />
        ))}
      </div>
    );
  }

  if (!properties.length) {
    return (
      <div className="grid-empty">
        <p>Nenhum imóvel encontrado.</p>
        <p className="grid-empty-hint">
          Extraia dados usando o botão "Extrair dados" no painel lateral,
          ou ajuste os filtros.
        </p>
      </div>
    );
  }

  return (
    <div className="property-grid-wrapper">
      <div className="grid-toolbar">
        <span className="grid-count">{sorted.length} imóveis</span>
        <select
          className="sort-select"
          value={filters.sort}
          onChange={e => onFiltersChange({ ...filters, sort: e.target.value, page: 1 })}
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="property-grid">
        {pageItems.map(p => (
          <PropertyCard key={p.code || p.url} property={p} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="page-btn"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .reduce((acc, p, i, arr) => {
              if (i > 0 && arr[i - 1] !== p - 1) acc.push('...');
              acc.push(p);
              return acc;
            }, [])
            .map((p, i) =>
              p === '...' ? (
                <span key={`dots-${i}`} className="page-dots">…</span>
              ) : (
                <button
                  key={p}
                  className={`page-btn ${p === page ? 'active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              )
            )}
          <button
            className="page-btn"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
