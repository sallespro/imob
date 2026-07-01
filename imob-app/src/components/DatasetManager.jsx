import { useState } from 'react';
import { createDataset, deleteDataset } from '../lib/db';

export default function DatasetManager({
  datasets,
  activeDataset,
  scrapeRunning,
  onSwitch,
  onRefresh,
  onClose,
  onScrapeNew,
}) {
  const [newName, setNewName] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    try {
      await createDataset(newName.trim(), newLabel.trim() || newName.trim());
      setNewName('');
      setNewLabel('');
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(name) {
    if (!confirm(`Apagar dataset "${name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteDataset(name);
      await onRefresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="dataset-manager-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dataset-manager">
        <div className="dataset-manager-header">
          <h2>Datasets</h2>
          <button className="dataset-manager-close" onClick={onClose}>×</button>
        </div>

        <div className="dataset-list">
          {datasets.length === 0 && <p className="dataset-empty">Nenhum dataset. Crie um abaixo.</p>}
          {datasets.map(ds => (
            <div
              key={ds.name}
              className={`dataset-row ${activeDataset?.name === ds.name ? 'active' : ''}`}
            >
              <div className="dataset-info">
                <span className="dataset-label">{ds.label || ds.name}</span>
                <span className="dataset-meta">{ds.name} · {ds.count} imóveis</span>
              </div>
              <div className="dataset-actions">
                {activeDataset?.name !== ds.name && (
                  <button
                    className="btn-sm btn-switch"
                    onClick={() => onSwitch(ds.name)}
                    disabled={scrapeRunning}
                  >
                    Ativar
                  </button>
                )}
                {activeDataset?.name === ds.name && (
                  <span className="dataset-active-badge">Ativo</span>
                )}
                <button
                  className="btn-sm btn-scrape-into"
                  onClick={() => onScrapeNew({ dataset: ds.name, datasetLabel: ds.label })}
                  disabled={scrapeRunning}
                  title="Extrair dados para este dataset"
                >
                  Extrair
                </button>
                <button
                  className="btn-sm btn-delete"
                  onClick={() => handleDelete(ds.name)}
                  disabled={scrapeRunning}
                  title="Apagar dataset"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>

        <form className="dataset-create" onSubmit={handleCreate}>
          <h3>Novo dataset</h3>
          <div className="dataset-create-row">
            <input
              className="dataset-input"
              placeholder="Nome (ex: ingleses-2q)"
              value={newName}
              onChange={e => setNewName(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
              required
            />
            <input
              className="dataset-input"
              placeholder="Rótulo (ex: Ingleses 2+ quartos)"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
            />
            <button type="submit" className="btn-create" disabled={creating || !newName.trim()}>
              {creating ? '...' : 'Criar'}
            </button>
          </div>
          {error && <p className="dataset-error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
