# Imóveis Florianópolis — Data Extractor & Visualizer

Extracts property listings from Auxiliadora Predial and visualizes them in a React app backed by SQLite. Supports multiple named datasets so you can scrape and compare different searches side-by-side.

## Quick Start

```bash
npm install
npm run start
# API server: http://localhost:3001
# App:        http://localhost:5173
```

On first run, the server auto-seeds a small default dataset (Campeche 3+ quartos, 2 pages). The app connects automatically once data is ready.

---

## App Features

- **Property grid** — paginated cards with sort options
- **Stats bar** — live aggregate stats (count, avg/min/max price, avg area)
- **Filter panel** — all search dimensions available on Auxiliadora Predial
- **Bairro map** — choropleth of property counts by neighbourhood
- **Extract modal** — scrape all pages for the current filter selection
- **Dataset manager** — create, switch, delete, and scrape into named datasets

### Filters

| Filter | Options |
|---|---|
| Transação | Comprar / Alugar |
| Categoria | Residencial / Comercial |
| Valor | Min/Max BRL |
| Quartos | 1+, 2+, 3+, 4+ |
| Vagas | Sem vaga, 1+, 2+, 3+, 4+ |
| Banheiros | 1+, 2+, 3+, 4+ |
| Tipo de imóvel | Casa, Apartamento, Cobertura, Condomínio, etc. |
| Bairro | ~42 bairros de Florianópolis (multi-select) |
| Área | Min/Max m² |
| Mobiliado | Sim / Semi / Não |
| Lançamentos | Sim / Não |
| Exclusivo | toggle |
| Comodidades | 21 opções (piscina, sacada, churrasqueira, etc.) |
| Destaques | Baixou o preço, Avalia imóvel no negócio |

---

## Dataset Management

Open **Datasets** in the header to:

- **Switch** the active dataset (all filters and views reflect its data)
- **Create** a new named dataset
- **Extrair** — scrape into a specific dataset using the current filters
- **Delete** a dataset

Each dataset is a standalone SQLite file in `datasets/`. The active dataset is tracked via `datasets/.active`.

---

## CLI Scraper

The scraper can also be run directly. It saves results to the API server (port 3001 must be running):

```bash
node scripts/scraper.js \
  --quartos 3 \
  --bairro Campeche \
  --tipoImovel Casa \
  --busybaseUrl http://localhost:3001
```

### Options

```
--transacao <comprar|alugar>         Default: comprar
--categoria <residencial|comercial>  Default: residencial
--cidade <nome>                      Default: sc+florianopolis
--bairro <nome>                      Repeatable
--quartos <1|2|3|4>                  Minimum bedrooms
--tipoImovel <tipo>                  Repeatable
--vagas <0|1|2|3|4>                 Garage spots
--banheiros <1|2|3|4>               Minimum bathrooms
--precoMin / --precoMax <BRL>        Price range
--areaMin / --areaMax <m2>           Area range
--maxPages <n>                       Limit pages (default: all)
--busybaseUrl <url>                  Default: http://localhost:3001
```

---

## Architecture

```
imob/
├── scrape-server.mjs       # API + scraper control server (port 3001)
├── datasets/               # SQLite files, one per dataset (gitignored)
├── images/                 # Cached property images (gitignored)
├── scripts/
│   └── scraper.js          # Playwright-based CLI scraper
└── imob-app/               # React + Vite frontend
    └── src/
        ├── App.jsx
        ├── components/
        │   ├── FilterPanel.jsx
        │   ├── PropertyCard.jsx
        │   ├── PropertyGrid.jsx
        │   ├── StatsBar.jsx
        │   ├── VizDrawer.jsx
        │   ├── BairroMap.jsx
        │   ├── DatasetManager.jsx
        │   └── ExtractModal.jsx
        └── lib/
            ├── constants.js   # Property types, amenities, neighbourhoods
            ├── db.js          # API client + filter logic
            └── scraper.js     # URL builder
```

### API Endpoints (port 3001)

| Method | Path | Description |
|---|---|---|
| GET | `/datasets` | List all datasets |
| POST | `/datasets` | Create dataset `{ name, label }` |
| GET | `/datasets/active` | Active dataset info |
| POST | `/datasets/active` | Switch active dataset `{ name }` |
| DELETE | `/datasets/:name` | Delete dataset |
| GET | `/properties` | All properties in active dataset |
| POST | `/properties` | Upsert properties |
| GET | `/scrape/status` | Scraper running state + log tail |
| POST | `/scrape` | Start scraper with filter opts |
| GET | `/images/:file` | Serve cached property images |
