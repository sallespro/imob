# Imóveis Florianópolis — Data Extractor & Visualizer

Extracts property listings from Auxiliadora Predial and visualizes them in a React app backed by BusyBase (local SQLite via Supabase-compatible API).

## Quick Start

### 1. Start BusyBase

```bash
bunx busybase serve
# Runs at http://localhost:54321
```

Get the anon key from the BusyBase startup output (or use the default `anon`).

### 2. Configure environment

```bash
cp .env.example imob-app/.env
# Edit imob-app/.env with your VITE_BUSYBASE_URL and VITE_BUSYBASE_KEY
```

### 3. Start the app

```bash
cd imob-app
npm install
npm run dev
# Visit http://localhost:5173
```

### 4. Extract data

Click **"Extrair dados"** in the left panel to pull listings from Auxiliadora Predial into BusyBase. Or use the CLI:

```bash
cd scripts
npm install
node scraper.js --quartos 3 --tipoImovel Casa --bairro Campeche --bairro "Novo Campeche"
```

---

## App Features

- **Left filter panel** — all search options available on the Auxiliadora Predial website
- **Reset filters** — clears all filters back to defaults
- **Extract data** — scrapes all pages for the current filter selection, saves to BusyBase
- **Property grid** — paginated cards (24/page) with sort options
- **Stats bar** — live aggregate stats (count, avg/min/max price, avg area)

### Available filters

| Filter | Options |
|---|---|
| Transação | Comprar / Alugar |
| Categoria | Residencial / Comercial |
| Valor | Min/Max BRL |
| Quartos | 1+, 2+, 3+, 4+ |
| Vagas | Sem vaga, 1+, 2+, 3+, 4+ |
| Banheiros | 1+, 2+, 3+, 4+ |
| Tipo de imóvel | Casa, Apartamento, Lote/Terreno, Casa em condomínio, etc. |
| Bairro | ~42 bairros de Florianópolis (multi-select) |
| Área | Min/Max m² |
| Mobiliado | Sim / Semi / Não |
| Lançamentos | Sim / Não |
| Exclusivo | toggle |
| Comodidades | 21 opções (piscina, sacada, churrasqueira, etc.) |
| Destaques | Baixou o preço, Avalia imóvel no negócio |

---

## CLI Scraper

```
Usage: node scripts/scraper.js [options]

Options:
  --transacao <comprar|alugar>     Default: comprar
  --categoria <residencial|comercial>  Default: residencial
  --estado <sigla>                 Default: sc
  --cidade <nome>                  Default: florianopolis
  --bairro <nome>                  Repeatable. e.g. --bairro Campeche --bairro "Novo Campeche"
  --quartos <1|2|3|4>             Minimum bedrooms
  --tipoImovel <tipo>              Repeatable. e.g. --tipoImovel Casa --tipoImovel Apartamento
  --vagas <0|1|2|3|4>            Garage spots (0 = sem vaga)
  --banheiros <1|2|3|4>          Minimum bathrooms
  --precoMin <valor>               Minimum price in BRL
  --precoMax <valor>               Maximum price in BRL
  --areaMin <m2>                   Minimum area in m²
  --areaMax <m2>                   Maximum area in m²
  --mobiliado <sim|semi|nao>       Furnished status
  --lancamentos <sim|nao>          New developments only
  --exclusivo                      Exclusive listings only
  --baixouPreco                    Price-reduced listings only
  --avaliaImovel                   "Avalia imóvel no negócio" listings
  --comodidade <nome>              Repeatable amenity filter
  --maxPages <n>                   Limit pages scraped (default: all)
  --busybaseUrl <url>              Default: http://localhost:54321
  --busybaseKey <key>              Default: anon
  --help                           Show this help

Examples:
  node scraper.js --quartos 3 --tipoImovel Casa --bairro Campeche
  node scraper.js --transacao alugar --quartos 2 --precoMax 5000
  node scraper.js --tipoImovel Apartamento --bairro "Lagoa da Conceição" --vagas 1 --maxPages 5
```

---

## Architecture

```
imob/
├── imob-app/          # React + Vite app
│   ├── src/
│   │   ├── App.jsx              # Root — state, extraction orchestration
│   │   ├── components/
│   │   │   ├── FilterPanel.jsx  # Left sidebar with all filters
│   │   │   ├── PropertyCard.jsx # Individual property card
│   │   │   ├── PropertyGrid.jsx # Paginated grid + sort
│   │   │   ├── StatsBar.jsx     # Aggregate stats
│   │   │   └── ExtractModal.jsx # Extraction progress modal
│   │   └── lib/
│   │       ├── constants.js     # PROPERTY_TYPES, AMENITIES, NEIGHBORHOODS, etc.
│   │       ├── db.js            # BusyBase client + query helpers
│   │       └── scraper.js       # Browser-side HTML parser + URL builder
│   └── vite.config.js           # Dev proxy: /api-proxy → auxiliadorapredial.com.br
│
└── scripts/
    ├── scraper.js     # CLI scraper (Node.js, axios + cheerio + @supabase/supabase-js)
    └── package.json
```

### How scraping works

- **Browser (app)**: Vite dev server proxies `/api-proxy/*` to `auxiliadorapredial.com.br`, bypassing CORS. Parsed with `DOMParser` in-browser.
- **CLI**: `axios` fetches directly with a realistic User-Agent header. Parsed with `cheerio`.
- **Deduplication**: Upsert on `code` (property ID from the listing URL). Re-running the same search updates existing records rather than duplicating.
- **Polite scraping**: 700ms delay between pages.
