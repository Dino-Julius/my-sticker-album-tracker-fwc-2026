import { useEffect, useMemo, useState } from "react";
import { FilterBar } from "./components/FilterBar";
import { StickerList } from "./components/StickerList";
import {
  applyFilters,
  createTradingText,
  exportMissingToCsv,
  exportProgressToJson,
  exportRepeatedToCsv,
  getCompletionPercentage,
  getCollectionName,
  getMissingStickers,
  getOwnedStickers,
  getRepeatedExtras,
  getRepeatedStickers,
  getStatsByCollection,
  getStickerQuantity,
  groupByCountry,
  importProgressFromJson,
  serializeFullProgress,
  STORAGE_KEY,
} from "./lib/album";
import { downloadTextFile } from "./lib/files";
import type { Filters, Progress, Sticker } from "./types";

const emptyFilters: Filters = {
  query: "",
  country: "",
  group: "",
  section: "",
  status: "all",
};

type View = "dashboard" | "registro" | "faltantes" | "repetidas" | "paises" | "datos";

const views: Array<{ id: View; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "registro", label: "Registro" },
  { id: "faltantes", label: "Faltantes" },
  { id: "repetidas", label: "Intercambio" },
  { id: "paises", label: "Colecciones" },
  { id: "datos", label: "Importar/Exportar" },
];

function App() {
  const [catalog, setCatalog] = useState<Sticker[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [selectedCollection, setSelectedCollection] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [progress, setProgress] = useState<Progress>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return {};
    }

    try {
      return JSON.parse(stored) as Progress;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}catalog.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("No se pudo cargar el catálogo.");
        }

        return response.json() as Promise<Sticker[]>;
      })
      .then((stickers) => setCatalog(stickers))
      .catch((error: Error) => setCatalogError(error.message));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  const dashboard = useMemo(() => {
    const owned = getOwnedStickers(catalog, progress);
    const missing = getMissingStickers(catalog, progress);
    const repeated = getRepeatedStickers(catalog, progress);
    const statsByCollection = getStatsByCollection(catalog, progress);

    return {
      total: catalog.length,
      owned: owned.length,
      missing: missing.length,
      repeated: repeated.length,
      repeatedExtras: getRepeatedExtras(catalog, progress),
      completion: getCompletionPercentage(catalog, progress),
      statsByCollection,
      mostMissing: [...statsByCollection].sort((a, b) => b.missing - a.missing).slice(0, 5),
      closest: [...statsByCollection]
        .filter((collection) => collection.missing > 0)
        .sort((a, b) => b.completionPercentage - a.completionPercentage || a.missing - b.missing)
        .slice(0, 5),
    };
  }, [catalog, progress]);

  const filteredStickers = useMemo(() => applyFilters(catalog, progress, filters), [catalog, filters, progress]);

  const setQuantity = (code: string, quantity: number) => {
    setProgress((current) => {
      const nextQuantity = Math.max(0, Math.floor(quantity));
      return { ...current, [code]: nextQuantity };
    });
  };

  if (catalogError) {
    return (
      <main className="app-shell">
        <p className="empty-state">{catalogError}</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Tracker personal</p>
          <h1>Álbum Mundial 2026</h1>
        </div>
        <div className="completion-ring" aria-label={`Avance ${dashboard.completion}%`}>
          {dashboard.completion}%
        </div>
      </header>

      <nav className="tab-bar" aria-label="Vistas del álbum">
        {views.map((view) => (
          <button
            key={view.id}
            className={activeView === view.id ? "active" : ""}
            onClick={() => {
              setActiveView(view.id);
              setFilters(emptyFilters);
            }}
          >
            {view.label}
          </button>
        ))}
      </nav>

      {activeView === "dashboard" ? (
        <DashboardView
          dashboard={dashboard}
          onOpenRegistro={(status) => {
            setFilters({ ...emptyFilters, status });
            setActiveView("registro");
          }}
          onOpenFaltantes={() => {
            setFilters(emptyFilters);
            setActiveView("faltantes");
          }}
          onOpenRepetidas={() => {
            setFilters(emptyFilters);
            setActiveView("repetidas");
          }}
          onOpenCollection={(collectionName) => {
            setSelectedCollection(collectionName);
            setActiveView("paises");
          }}
        />
      ) : null}
      {activeView === "registro" ? (
        <RegistroView
          catalog={catalog}
          filters={filters}
          filteredStickers={filteredStickers}
          progress={progress}
          onFiltersChange={setFilters}
          onSetQuantity={setQuantity}
        />
      ) : null}
      {activeView === "faltantes" ? (
        <GroupedCodesView
          title="Faltantes"
          catalog={catalog}
          filters={{ ...filters, status: "missing" }}
          progress={progress}
          stickers={applyFilters(catalog, progress, { ...filters, status: "missing" })}
          onFiltersChange={(nextFilters) => setFilters({ ...nextFilters, status: "all" })}
        />
      ) : null}
      {activeView === "repetidas" ? (
        <RepeatedView catalog={catalog} filters={filters} progress={progress} onFiltersChange={setFilters} />
      ) : null}
      {activeView === "paises" ? (
        <CollectionsView
          catalog={catalog}
          progress={progress}
          selectedCollection={selectedCollection}
          onSelectedCollectionChange={setSelectedCollection}
          onSetQuantity={setQuantity}
        />
      ) : null}
      {activeView === "datos" ? <DataView catalog={catalog} progress={progress} setProgress={setProgress} /> : null}
    </main>
  );
}

function DashboardView({
  dashboard,
  onOpenRegistro,
  onOpenFaltantes,
  onOpenRepetidas,
  onOpenCollection,
}: {
  dashboard: {
    total: number;
    owned: number;
    missing: number;
    repeated: number;
    repeatedExtras: number;
    completion: number;
    statsByCollection: ReturnType<typeof getStatsByCollection>;
    mostMissing: ReturnType<typeof getStatsByCollection>;
    closest: ReturnType<typeof getStatsByCollection>;
  };
  onOpenRegistro: (status: Filters["status"]) => void;
  onOpenFaltantes: () => void;
  onOpenRepetidas: () => void;
  onOpenCollection: (collectionName: string) => void;
}) {
  return (
    <section className="view-stack">
      <div className="metric-grid">
        <MetricCard label="Total" value={dashboard.total} onClick={() => onOpenRegistro("all")} />
        <MetricCard label="La tengo" value={dashboard.owned} onClick={() => onOpenRegistro("owned")} />
        <MetricCard label="Faltantes" value={dashboard.missing} onClick={onOpenFaltantes} />
        <MetricCard label="Repetidas" value={dashboard.repeated} onClick={onOpenRepetidas} />
        <MetricCard label="Extras para cambiar" value={dashboard.repeatedExtras} onClick={onOpenRepetidas} />
        <MetricCard label="Completado" value={`${dashboard.completion}%`} />
      </div>

      <section className="panel">
        <h2>Avance por colección</h2>
        <div className="country-progress-list">
          {dashboard.statsByCollection.map((collection) => (
            <button className="country-progress collection-progress-button" key={collection.name} onClick={() => onOpenCollection(collection.name)}>
              <div>
                <strong>{collection.name}</strong>
                <span>
                  {collection.owned}/{collection.total}
                </span>
              </div>
              <progress value={collection.completionPercentage} max="100" />
            </button>
          ))}
        </div>
      </section>

      <div className="split-grid">
        <MiniRanking title="Colecciones con más faltantes" items={dashboard.mostMissing} valueKey="missing" suffix=" faltan" />
        <MiniRanking title="Más cerca de completar" items={dashboard.closest} valueKey="completionPercentage" suffix="%" />
      </div>
    </section>
  );
}

function MetricCard({ label, value, onClick }: { label: string; value: string | number; onClick?: () => void }) {
  if (onClick) {
    return (
      <button className="metric-card metric-button" onClick={onClick}>
        <span>{label}</span>
        <strong>{value}</strong>
      </button>
    );
  }

  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function MiniRanking({
  title,
  items,
  valueKey,
  suffix,
}: {
  title: string;
  items: ReturnType<typeof getStatsByCollection>;
  valueKey: "missing" | "completionPercentage";
  suffix: string;
}) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="ranking-list">
        {items.map((item) => (
          <div key={item.name} className="ranking-row">
            <span>{item.name}</span>
            <strong>
              {item[valueKey]}
              {suffix}
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function RegistroView({
  catalog,
  filters,
  filteredStickers,
  progress,
  onFiltersChange,
  onSetQuantity,
}: {
  catalog: Sticker[];
  filters: Filters;
  filteredStickers: Sticker[];
  progress: Progress;
  onFiltersChange: (filters: Filters) => void;
  onSetQuantity: (code: string, quantity: number) => void;
}) {
  return (
    <section className="view-stack">
      <FilterBar catalog={catalog} filters={filters} onChange={onFiltersChange} />
      <div className="section-heading">
        <h2>Registro</h2>
        <span>{filteredStickers.length} estampas</span>
      </div>
      <StickerList stickers={filteredStickers} progress={progress} onSetQuantity={onSetQuantity} />
    </section>
  );
}

function GroupedCodesView({
  title,
  catalog,
  filters,
  progress,
  stickers,
  onFiltersChange,
}: {
  title: string;
  catalog: Sticker[];
  filters: Filters;
  progress: Progress;
  stickers: Sticker[];
  onFiltersChange: (filters: Filters) => void;
}) {
  const groups = groupByCountry(stickers);

  return (
    <section className="view-stack">
      <FilterBar catalog={catalog} filters={filters} onChange={onFiltersChange} showStatus={false} />
      <div className="section-heading">
        <h2>{title}</h2>
        <span>{stickers.length} estampas</span>
      </div>
      <div className="grouped-list">
        {[...groups.entries()].map(([country, countryStickers]) => (
          <article className="panel" key={country}>
            <h3>
              {country} — faltan {countryStickers.length}
            </h3>
            <p className="code-list">{countryStickers.map((sticker) => sticker.code).join(", ")}</p>
          </article>
        ))}
      </div>
      {stickers.length === 0 ? <p className="empty-state">No tienes faltantes con esos filtros.</p> : null}
      <p className="sr-only">{progress ? "Progreso cargado" : ""}</p>
    </section>
  );
}

function RepeatedView({
  catalog,
  filters,
  progress,
  onFiltersChange,
}: {
  catalog: Sticker[];
  filters: Filters;
  progress: Progress;
  onFiltersChange: (filters: Filters) => void;
}) {
  const stickers = applyFilters(catalog, progress, { ...filters, status: "repeated" });
  const groups = groupByCountry(stickers);
  const [copyLabel, setCopyLabel] = useState("Copiar lista para intercambio");

  const copyTradeList = async () => {
    await navigator.clipboard.writeText(createTradingText(catalog, progress));
    setCopyLabel("Lista copiada");
    window.setTimeout(() => setCopyLabel("Copiar lista para intercambio"), 1800);
  };

  return (
    <section className="view-stack">
      <FilterBar catalog={catalog} filters={{ ...filters, status: "repeated" }} onChange={onFiltersChange} showStatus={false} />
      <button className="primary-button wide-button" onClick={copyTradeList}>
        {copyLabel}
      </button>
      <div className="section-heading">
        <h2>Repetidas / Intercambio</h2>
        <span>{stickers.length} estampas</span>
      </div>
      <div className="grouped-list">
        {[...groups.entries()].map(([country, countryStickers]) => (
          <article className="panel" key={country}>
            <h3>{country}</h3>
            <div className="trade-code-list">
              {countryStickers.map((sticker) => {
                const extras = getStickerQuantity(sticker.code, progress) - 1;

                return (
                  <span key={sticker.code}>
                    {sticker.code} x{extras} {extras === 1 ? "extra" : "extras"}
                  </span>
                );
              })}
            </div>
          </article>
        ))}
      </div>
      {stickers.length === 0 ? <p className="empty-state">Todavía no tienes repetidas para intercambio.</p> : null}
    </section>
  );
}

function CollectionsView({
  catalog,
  progress,
  selectedCollection,
  onSelectedCollectionChange,
  onSetQuantity,
}: {
  catalog: Sticker[];
  progress: Progress;
  selectedCollection: string;
  onSelectedCollectionChange: (collectionName: string) => void;
  onSetQuantity: (code: string, quantity: number) => void;
}) {
  const stats = getStatsByCollection(catalog, progress);
  const [collectionQuery, setCollectionQuery] = useState("");
  const collection = selectedCollection && stats.some((item) => item.name === selectedCollection) ? selectedCollection : stats[0]?.name || "";
  const selectedStats = stats.find((item) => item.name === collection);
  const stickers = catalog.filter((sticker) => getCollectionName(sticker) === collection);
  const visibleCollections = stats.filter((item) => item.name.toLowerCase().includes(collectionQuery.toLowerCase().trim()));

  return (
    <section className="view-stack">
      <section className="panel collection-selector-panel">
        <label className="search-field">
          <span>Buscar colección</span>
          <input
            type="search"
            placeholder="FIFA / FWC, Coca-Cola o selección"
            value={collectionQuery}
            onChange={(event) => setCollectionQuery(event.target.value)}
          />
        </label>
        <label>
          <span>Colección</span>
          <select value={collection} onChange={(event) => onSelectedCollectionChange(event.target.value)}>
            {visibleCollections.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel">
        <div className="section-heading flush">
          <h2>{collection}</h2>
          <span>{stickers.length} estampas</span>
        </div>
        {selectedStats ? (
          <div className="collection-summary">
            <strong>{selectedStats.completionPercentage}% completado</strong>
            <span>{selectedStats.owned} tengo</span>
            <span>{selectedStats.missing} faltan</span>
            <span>{selectedStats.repeatedExtras} extras</span>
          </div>
        ) : null}
        <StickerList stickers={stickers} progress={progress} onSetQuantity={onSetQuantity} compact />
      </section>
    </section>
  );
}

function DataView({
  catalog,
  progress,
  setProgress,
}: {
  catalog: Sticker[];
  progress: Progress;
  setProgress: React.Dispatch<React.SetStateAction<Progress>>;
}) {
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState("");

  const importTextProgress = (jsonText: string) => {
    try {
      setProgress(importProgressFromJson(jsonText, catalog));
      setMessage("Progreso importado correctamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo importar el progreso.");
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file) {
      return;
    }

    file.text().then(importTextProgress);
  };

  const resetProgress = () => {
    if (window.confirm("¿Seguro que quieres reiniciar todo tu progreso?")) {
      setProgress({});
      setMessage("Progreso reiniciado.");
    }
  };

  return (
    <section className="view-stack">
      <section className="panel action-panel">
        <h2>Exportar</h2>
        <button
          className="primary-button"
          onClick={() =>
            downloadTextFile("progreso-my-sticker-album-tracker-fwc-2026.json", exportProgressToJson(catalog, progress), "application/json")
          }
        >
          Exportar progreso JSON
        </button>
        <button
          className="ghost-button"
          onClick={() => downloadTextFile("faltantes-my-sticker-album-tracker-fwc-2026.csv", exportMissingToCsv(catalog, progress), "text/csv")}
        >
          Exportar faltantes CSV
        </button>
        <button
          className="ghost-button"
          onClick={() => downloadTextFile("repetidas-my-sticker-album-tracker-fwc-2026.csv", exportRepeatedToCsv(catalog, progress), "text/csv")}
        >
          Exportar repetidas CSV
        </button>
      </section>

      <section className="panel action-panel">
        <h2>Importar</h2>
        <label className="file-picker">
          <span>Archivo JSON</span>
          <input type="file" accept="application/json,.json" onChange={(event) => handleFile(event.target.files?.[0])} />
        </label>
        <label className="text-import">
          <span>Pegar JSON</span>
          <textarea value={importText} onChange={(event) => setImportText(event.target.value)} rows={8} />
        </label>
        <button className="primary-button" onClick={() => importTextProgress(importText)}>
          Importar JSON pegado
        </button>
      </section>

      <section className="panel action-panel">
        <h2>Reiniciar</h2>
        <button className="danger-button" onClick={resetProgress}>
          Reiniciar progreso
        </button>
        <p>
          El catálogo maestro no se modifica. Se guardan {Object.keys(serializeFullProgress(catalog, progress)).length} códigos en el
          respaldo exportado.
        </p>
      </section>

      {message ? <p className="toast-message">{message}</p> : null}
    </section>
  );
}

export default App;
