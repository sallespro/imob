import { X, ExternalLink, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { buildExternalUrl } from '../lib/scraper';

export default function ExtractModal({ filters, status, onClose, onConfirm }) {
  const previewUrl = buildExternalUrl(filters, 1);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>Extrair dados</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {status === 'idle' && (
            <>
              <p className="modal-desc">
                Os dados serão extraídos do site da Auxiliadora Predial e salvos no BusyBase local.
                A extração percorre todas as páginas disponíveis com os filtros selecionados.
              </p>

              <div className="modal-info">
                <AlertCircle size={14} />
                <span>
                  A extração usa Playwright (navegador headless) via scrape-server local em
                  <code>localhost:3001</code>. Certifique-se de que o BusyBase está ativo em <code>localhost:54321</code>.
                </span>
              </div>

              <div className="modal-url">
                <span className="modal-url-label">URL de busca:</span>
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="modal-url-link">
                  {previewUrl.substring(0, 80)}...
                  <ExternalLink size={11} />
                </a>
              </div>

              <div className="modal-actions">
                <button className="btn-secondary" onClick={onClose}>Cancelar</button>
                <button className="btn-primary" onClick={onConfirm}>Iniciar extração</button>
              </div>
            </>
          )}

          {status === 'running' && (
            <div className="modal-progress">
              <Loader size={32} className="spin" />
              <p>Extraindo dados... Isso pode levar alguns minutos.</p>
              <p className="modal-progress-hint">Acompanhe o console do navegador para detalhes.</p>
            </div>
          )}

          {status === 'done' && (
            <div className="modal-progress">
              <CheckCircle size={32} color="#22c55e" />
              <p>Extração concluída! Os dados foram salvos no BusyBase.</p>
              <button className="btn-primary" onClick={onClose}>Fechar</button>
            </div>
          )}

          {status === 'error' && (
            <div className="modal-progress">
              <AlertCircle size={32} color="#ef4444" />
              <p>Erro durante a extração. Verifique se o BusyBase e o scrape-server estão rodando.</p>
              <p className="modal-progress-hint">
                Use <code>npm run start</code> para iniciar todos os servidores.
              </p>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={onClose}>Fechar</button>
                <button className="btn-primary" onClick={onConfirm}>Tentar novamente</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
