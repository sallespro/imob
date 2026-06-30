import { MapPin, Bed, Bath, Car, Maximize2, ExternalLink, Tag } from 'lucide-react';

function formatPrice(price) {
  if (!price) return 'Consulte';
  return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export default function PropertyCard({ property }) {
  const features = JSON.parse(property.features || '[]');
  const tags = JSON.parse(property.tags || '[]');

  const tagLabels = {
    'novo': { label: 'Novo', color: '#22c55e' },
    'preco-baixou': { label: 'Baixou ↓', color: '#f59e0b' },
    'avalia-imovel': { label: 'Avalia imóvel', color: '#8b5cf6' },
    'exclusivo': { label: 'Exclusivo', color: '#ef4444' },
    'mobiliado': { label: 'Mobiliado', color: '#06b6d4' },
  };

  return (
    <div className="property-card">
      {/* Image / placeholder */}
      <div className="property-image">
        {(property.image_local || property.image_url) ? (
          <img
            src={property.image_local ? `http://localhost:3001${property.image_local}` : property.image_url}
            alt={property.title}
            loading="lazy"
            onError={e => { if (property.image_url && e.target.src !== property.image_url) e.target.src = property.image_url; }}
          />
        ) : (
          <div className="property-image-placeholder">
            <span>{property.tipo}</span>
          </div>
        )}
        {tags.length > 0 && (
          <div className="property-tags">
            {tags.map(t => tagLabels[t] && (
              <span
                key={t}
                className="property-tag"
                style={{ background: tagLabels[t].color }}
              >
                {tagLabels[t].label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="property-body">
        <div className="property-type">{property.tipo}</div>

        <div className="property-price">
          {property.preco_original && property.preco_original !== property.preco_venda ? (
            <>
              <span className="price-original">{formatPrice(property.preco_original)}</span>
              <span className="price-sale">{formatPrice(property.preco_venda)}</span>
            </>
          ) : (
            <span className="price-main">{formatPrice(property.preco_venda)}</span>
          )}
        </div>

        <div className="property-location">
          <MapPin size={12} />
          <span>{[property.bairro, property.cidade].filter(Boolean).join(', ')}</span>
          {property.lat && property.lng && (
            <a
              href={`https://www.google.com/maps?q=${property.lat},${property.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="map-link"
              title="Ver no mapa"
            >
              📍
            </a>
          )}
        </div>

        <div className="property-metrics">
          {property.area_m2 && (
            <span className="metric">
              <Maximize2 size={12} />
              {property.area_m2}m²
            </span>
          )}
          {property.quartos !== null && property.quartos !== undefined && (
            <span className="metric">
              <Bed size={12} />
              {property.quartos}
            </span>
          )}
          {property.banheiros !== null && property.banheiros !== undefined && (
            <span className="metric">
              <Bath size={12} />
              {property.banheiros}
            </span>
          )}
          {property.vagas !== null && property.vagas !== undefined && (
            <span className="metric">
              <Car size={12} />
              {property.vagas}
            </span>
          )}
        </div>

        {features.length > 0 && (
          <div className="property-features">
            {features.slice(0, 4).map(f => (
              <span key={f} className="feature-chip">{f}</span>
            ))}
            {features.length > 4 && (
              <span className="feature-chip more">+{features.length - 4}</span>
            )}
          </div>
        )}

        <a
          href={property.url}
          target="_blank"
          rel="noopener noreferrer"
          className="property-link"
        >
          Ver anúncio <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
