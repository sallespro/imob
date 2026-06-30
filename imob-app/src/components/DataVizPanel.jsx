import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from 'recharts';

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

function formatPrice(v) {
  if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$${(v / 1_000).toFixed(0)}K`;
  return `R$${v}`;
}

function buildHistogram(properties, buckets = 10) {
  const prices = properties.map(p => p.preco_venda).filter(v => v > 0);
  if (!prices.length) return [];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return [{ label: formatPrice(min), count: prices.length }];
  const step = (max - min) / buckets;
  const bins = Array.from({ length: buckets }, (_, i) => ({
    from: min + i * step,
    to: min + (i + 1) * step,
    count: 0,
  }));
  prices.forEach(p => {
    const idx = Math.min(Math.floor((p - min) / step), buckets - 1);
    bins[idx].count++;
  });
  return bins.map(b => ({ label: formatPrice(b.from), count: b.count }));
}

function buildTipoCounts(properties) {
  const counts = {};
  properties.forEach(p => {
    if (p.tipo) counts[p.tipo] = (counts[p.tipo] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));
}

function buildQuartosCounts(properties) {
  const counts = {};
  properties.forEach(p => {
    const q = p.quartos || 0;
    const label = q === 0 ? 'N/A' : `${q} qto${q > 1 ? 's' : ''}`;
    counts[label] = (counts[label] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, value]) => ({ name, value }));
}

const PriceTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="viz-tooltip">
      <div className="viz-tooltip-label">{payload[0].payload.label}</div>
      <div className="viz-tooltip-value">{payload[0].value} imóveis</div>
    </div>
  );
};

export default function DataVizPanel({ properties }) {
  const histogram = useMemo(() => buildHistogram(properties), [properties]);
  const tipoCounts = useMemo(() => buildTipoCounts(properties), [properties]);
  const quartosCounts = useMemo(() => buildQuartosCounts(properties), [properties]);

  if (!properties.length) return null;

  return (
    <div className="dataviz-panel">
      <div className="dataviz-section">
        <h4 className="dataviz-title">Distribuição de Preços</h4>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={histogram} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              angle={-35}
              textAnchor="end"
              interval={0}
            />
            <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} width={24} />
            <Tooltip content={<PriceTooltip />} />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {histogram.map((_, i) => (
                <Cell key={i} fill={`hsl(${220 + i * 8}, 70%, ${55 + i * 2}%)`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="dataviz-row">
        <div className="dataviz-section dataviz-half">
          <h4 className="dataviz-title">Por Tipo</h4>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={tipoCounts}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={50}
                labelLine={false}
              >
                {tipoCounts.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v, name) => [`${v} imóveis`, name]}
                contentStyle={{ fontSize: 11 }}
              />
              <Legend
                iconSize={8}
                iconType="circle"
                wrapperStyle={{ fontSize: 9, paddingTop: 4 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="dataviz-section dataviz-half">
          <h4 className="dataviz-title">Por Quartos</h4>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={quartosCounts} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 28 }}>
              <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 9, fill: '#94a3b8' }} width={28} />
              <Tooltip
                formatter={v => [`${v} imóveis`]}
                contentStyle={{ fontSize: 11 }}
              />
              <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                {quartosCounts.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
