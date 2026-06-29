import { Home, TrendingUp, TrendingDown, BarChart2 } from 'lucide-react';

function formatPrice(price) {
  if (!price) return '—';
  if (price >= 1_000_000) return `R$ ${(price / 1_000_000).toFixed(1)}M`;
  if (price >= 1_000) return `R$ ${(price / 1_000).toFixed(0)}K`;
  return `R$ ${price.toLocaleString('pt-BR')}`;
}

export default function StatsBar({ properties }) {
  if (!properties || properties.length === 0) return null;

  const prices = properties.map(p => p.preco_venda).filter(Boolean);
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;

  const areas = properties.map(p => p.area_m2).filter(Boolean);
  const avgArea = areas.length ? areas.reduce((a, b) => a + b, 0) / areas.length : 0;

  return (
    <div className="stats-bar">
      <div className="stat">
        <Home size={14} />
        <span className="stat-value">{properties.length}</span>
        <span className="stat-label">imóveis</span>
      </div>
      <div className="stat">
        <BarChart2 size={14} />
        <span className="stat-value">{formatPrice(avg)}</span>
        <span className="stat-label">preço médio</span>
      </div>
      <div className="stat">
        <TrendingDown size={14} />
        <span className="stat-value">{formatPrice(min)}</span>
        <span className="stat-label">mínimo</span>
      </div>
      <div className="stat">
        <TrendingUp size={14} />
        <span className="stat-value">{formatPrice(max)}</span>
        <span className="stat-label">máximo</span>
      </div>
      {avgArea > 0 && (
        <div className="stat">
          <span className="stat-value">{avgArea.toFixed(0)}m²</span>
          <span className="stat-label">área média</span>
        </div>
      )}
    </div>
  );
}
