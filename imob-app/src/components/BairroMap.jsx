import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Approximate GeoJSON polygons for Florianópolis neighborhoods (simplified)
// Coordinates are [lng, lat] per GeoJSON spec
const BAIRROS_GEO = [
  { name: 'Canasvieiras', coords: [[-48.475, -27.435], [-48.455, -27.430], [-48.452, -27.445], [-48.472, -27.450], [-48.475, -27.435]] },
  { name: 'Ponta das Canas', coords: [[-48.453, -27.425], [-48.438, -27.422], [-48.435, -27.435], [-48.451, -27.438], [-48.453, -27.425]] },
  { name: 'Ingleses', coords: [[-48.435, -27.435], [-48.415, -27.432], [-48.412, -27.448], [-48.432, -27.452], [-48.435, -27.435]] },
  { name: 'Santinho', coords: [[-48.415, -27.430], [-48.398, -27.435], [-48.396, -27.448], [-48.413, -27.450], [-48.415, -27.430]] },
  { name: 'Cachoeira do Bom Jesus', coords: [[-48.495, -27.440], [-48.475, -27.435], [-48.472, -27.450], [-48.480, -27.455], [-48.495, -27.445], [-48.495, -27.440]] },
  { name: 'Vargem Grande', coords: [[-48.520, -27.445], [-48.498, -27.440], [-48.495, -27.455], [-48.505, -27.462], [-48.518, -27.455], [-48.520, -27.445]] },
  { name: 'Vargem Pequena', coords: [[-48.518, -27.455], [-48.505, -27.462], [-48.508, -27.472], [-48.520, -27.468], [-48.518, -27.455]] },
  { name: 'Daniela', coords: [[-48.535, -27.458], [-48.520, -27.455], [-48.518, -27.468], [-48.530, -27.472], [-48.535, -27.465], [-48.535, -27.458]] },
  { name: 'Sambaqui', coords: [[-48.535, -27.468], [-48.520, -27.468], [-48.518, -27.480], [-48.532, -27.482], [-48.535, -27.475], [-48.535, -27.468]] },
  { name: 'Santo Antônio de Lisboa', coords: [[-48.535, -27.480], [-48.520, -27.480], [-48.518, -27.492], [-48.530, -27.495], [-48.535, -27.488], [-48.535, -27.480]] },
  { name: 'Ratones', coords: [[-48.505, -27.462], [-48.483, -27.458], [-48.480, -27.472], [-48.500, -27.475], [-48.505, -27.468], [-48.505, -27.462]] },
  { name: 'Jurerê', coords: [[-48.508, -27.472], [-48.492, -27.470], [-48.490, -27.482], [-48.505, -27.485], [-48.508, -27.478], [-48.508, -27.472]] },
  { name: 'Jurerê Internacional', coords: [[-48.522, -27.468], [-48.510, -27.468], [-48.508, -27.480], [-48.520, -27.482], [-48.522, -27.475], [-48.522, -27.468]] },
  { name: 'João Paulo', coords: [[-48.538, -27.495], [-48.520, -27.492], [-48.518, -27.505], [-48.532, -27.508], [-48.538, -27.502], [-48.538, -27.495]] },
  { name: 'Coqueiros', coords: [[-48.573, -27.568], [-48.555, -27.562], [-48.552, -27.575], [-48.568, -27.580], [-48.573, -27.572], [-48.573, -27.568]] },
  { name: 'Estreito', coords: [[-48.585, -27.575], [-48.570, -27.570], [-48.568, -27.582], [-48.580, -27.586], [-48.585, -27.580], [-48.585, -27.575]] },
  { name: 'Centro', coords: [[-48.552, -27.592], [-48.535, -27.588], [-48.532, -27.600], [-48.548, -27.605], [-48.552, -27.598], [-48.552, -27.592]] },
  { name: 'Agronômica', coords: [[-48.535, -27.588], [-48.518, -27.582], [-48.515, -27.595], [-48.530, -27.600], [-48.535, -27.594], [-48.535, -27.588]] },
  { name: 'Trindade', coords: [[-48.518, -27.582], [-48.500, -27.575], [-48.498, -27.588], [-48.515, -27.595], [-48.518, -27.588], [-48.518, -27.582]] },
  { name: 'Carvoeira', coords: [[-48.500, -27.572], [-48.485, -27.568], [-48.482, -27.580], [-48.498, -27.585], [-48.500, -27.578], [-48.500, -27.572]] },
  { name: 'Itacorubi', coords: [[-48.485, -27.565], [-48.465, -27.558], [-48.462, -27.572], [-48.480, -27.578], [-48.485, -27.572], [-48.485, -27.565]] },
  { name: 'Pantanal', coords: [[-48.518, -27.595], [-48.498, -27.590], [-48.495, -27.602], [-48.512, -27.608], [-48.518, -27.602], [-48.518, -27.595]] },
  { name: 'Santa Mônica', coords: [[-48.498, -27.585], [-48.480, -27.580], [-48.478, -27.592], [-48.495, -27.598], [-48.498, -27.592], [-48.498, -27.585]] },
  { name: 'Beiramar', coords: [[-48.555, -27.598], [-48.548, -27.593], [-48.545, -27.608], [-48.552, -27.612], [-48.555, -27.605], [-48.555, -27.598]] },
  { name: 'Saco dos Limões', coords: [[-48.548, -27.605], [-48.530, -27.600], [-48.528, -27.613], [-48.545, -27.618], [-48.548, -27.610], [-48.548, -27.605]] },
  { name: 'Costeira do Pirajubaé', coords: [[-48.530, -27.615], [-48.512, -27.610], [-48.510, -27.622], [-48.525, -27.628], [-48.530, -27.622], [-48.530, -27.615]] },
  { name: 'Tapera', coords: [[-48.545, -27.618], [-48.528, -27.614], [-48.525, -27.628], [-48.540, -27.632], [-48.545, -27.625], [-48.545, -27.618]] },
  { name: 'Lagoa da Conceição', coords: [[-48.465, -27.572], [-48.440, -27.565], [-48.438, -27.580], [-48.460, -27.588], [-48.465, -27.580], [-48.465, -27.572]] },
  { name: 'Barra da Lagoa', coords: [[-48.415, -27.572], [-48.395, -27.568], [-48.392, -27.582], [-48.412, -27.588], [-48.415, -27.578], [-48.415, -27.572]] },
  { name: 'Porto da Lagoa', coords: [[-48.440, -27.565], [-48.415, -27.560], [-48.412, -27.575], [-48.435, -27.580], [-48.440, -27.572], [-48.440, -27.565]] },
  { name: 'Campeche', coords: [[-48.480, -27.655], [-48.455, -27.648], [-48.452, -27.665], [-48.475, -27.672], [-48.480, -27.662], [-48.480, -27.655]] },
  { name: 'Rio Tavares', coords: [[-48.455, -27.648], [-48.428, -27.642], [-48.425, -27.658], [-48.450, -27.665], [-48.455, -27.655], [-48.455, -27.648]] },
  { name: 'Morro das Pedras', coords: [[-48.498, -27.662], [-48.480, -27.658], [-48.478, -27.672], [-48.495, -27.678], [-48.498, -27.668], [-48.498, -27.662]] },
  { name: 'Novo Campeche', coords: [[-48.478, -27.672], [-48.455, -27.668], [-48.452, -27.682], [-48.475, -27.688], [-48.478, -27.680], [-48.478, -27.672]] },
  { name: 'Armação', coords: [[-48.502, -27.720], [-48.478, -27.715], [-48.475, -27.730], [-48.498, -27.736], [-48.502, -27.726], [-48.502, -27.720]] },
  { name: 'Pântano do Sul', coords: [[-48.505, -27.740], [-48.480, -27.735], [-48.478, -27.750], [-48.500, -27.755], [-48.505, -27.748], [-48.505, -27.740]] },
  { name: 'Ribeirão da Ilha', coords: [[-48.535, -27.728], [-48.510, -27.722], [-48.508, -27.740], [-48.530, -27.745], [-48.535, -27.735], [-48.535, -27.728]] },
  { name: 'Alto Ribeirão', coords: [[-48.535, -27.748], [-48.510, -27.742], [-48.508, -27.758], [-48.530, -27.762], [-48.535, -27.755], [-48.535, -27.748]] },
  { name: 'Balneário', coords: [[-48.555, -27.638], [-48.530, -27.632], [-48.528, -27.645], [-48.550, -27.650], [-48.555, -27.642], [-48.555, -27.638]] },
  { name: 'Açores', coords: [[-48.520, -27.755], [-48.495, -27.750], [-48.492, -27.766], [-48.515, -27.772], [-48.520, -27.762], [-48.520, -27.755]] },
  { name: 'Daniel Lista', coords: [[-48.430, -27.592], [-48.410, -27.586], [-48.408, -27.600], [-48.426, -27.606], [-48.430, -27.598], [-48.430, -27.592]] },
  { name: 'Vargem do Bom Jesus', coords: [[-48.498, -27.448], [-48.480, -27.445], [-48.478, -27.458], [-48.495, -27.462], [-48.498, -27.455], [-48.498, -27.448]] },
];

function getColor(count, max, selected) {
  if (selected) return '#1e40af';
  if (!count) return '#e2e8f0';
  const t = Math.min(count / Math.max(max, 1), 1);
  const r = Math.round(219 - t * 130);
  const g = Math.round(234 - t * 150);
  const b = Math.round(254 - t * 60);
  return `rgb(${r},${g},${b})`;
}

export default function BairroMap({ selectedBairros, onToggleBairro, propertyCounts = {}, totalCount = 0 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({});

  const maxCount = Math.max(...Object.values(propertyCounts), 1);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [-27.59, -48.49],
      zoom: 11,
      zoomControl: true,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; layersRef.current = {}; };
  }, []);

  // Update polygon colors + click handlers when props change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old layers
    Object.values(layersRef.current).forEach(l => l.remove());
    layersRef.current = {};

    BAIRROS_GEO.forEach(bairro => {
      const selected = selectedBairros.includes(bairro.name);
      const count = propertyCounts[bairro.name] || 0;
      const fillColor = getColor(count, maxCount, selected);

      const polygon = L.polygon(
        bairro.coords.map(([lng, lat]) => [lat, lng]),
        {
          fillColor,
          fillOpacity: 0.7,
          color: selected ? '#1e3a8a' : '#94a3b8',
          weight: selected ? 2 : 1,
        }
      ).addTo(map);

      const tooltipContent = `<strong>${bairro.name}</strong>${count ? `<br/>${count} imóveis` : ''}<br/><em>${selected ? 'Clique para remover' : 'Clique para selecionar'}</em>`;
      polygon.bindTooltip(tooltipContent, { sticky: true, opacity: 0.9 });
      polygon.on('click', () => onToggleBairro(bairro.name));

      layersRef.current[bairro.name] = polygon;
    });
  }, [selectedBairros, propertyCounts, maxCount, onToggleBairro]);

  return (
    <div className="bairro-map-container">
      <div className="bairro-map-header">
        <span className="bairro-map-title">Mapa de Bairros</span>
        <div className="bairro-map-meta">
          {totalCount > 0 && (
            <span className="bairro-map-total">{totalCount.toLocaleString('pt-BR')} imóveis</span>
          )}
          {selectedBairros.length > 0 && (
            <span className="bairro-map-hint">{selectedBairros.length} selecionado{selectedBairros.length > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
      <div ref={containerRef} style={{ height: 280, width: '100%', borderRadius: 8 }} />
    </div>
  );
}
