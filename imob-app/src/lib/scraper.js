const SITE_BASE = 'https://www.auxiliadorapredial.com.br';

export function buildExternalUrl(filters, page = 1) {
  const transacao = filters.transacao || 'comprar';
  const categoria = filters.categoria || 'residencial';
  const cidade = filters.cidade || 'sc+florianopolis';
  const path = `/${transacao}/${categoria}/${cidade}`;
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (filters.quartos) params.set('quartos', filters.quartos);
  for (const t of (filters.tipoImovel || [])) params.append('tipoImovel', t);
  if ((filters.bairro || []).length > 0) params.set('bairro', filters.bairro.join(','));
  if (filters.precoMin) params.set('precoMin', filters.precoMin);
  if (filters.precoMax) params.set('precoMax', filters.precoMax);
  if (filters.vagas) params.set('vagas', String(filters.vagas));
  if (filters.banheiros) params.set('banheiros', filters.banheiros);
  if (filters.areaMin) params.set('areaMin', filters.areaMin);
  if (filters.areaMax) params.set('areaMax', filters.areaMax);
  const qs = params.toString();
  return `${SITE_BASE}${path}${qs ? '?' + qs : ''}`;
}
