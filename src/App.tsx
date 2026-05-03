import { useEffect, useMemo, useState } from "react";
import { FilterBar } from "./components/FilterBar";
import { StickerList } from "./components/StickerList";
import {
  applyFilters,
  applyTradeToProgress,
  createTradeSummary,
  createTradingText,
  exportMissingToCsv,
  exportProgressToJson,
  exportRepeatedToCsv,
  formatTradeItems,
  getCompletionPercentage,
  getCollectionName,
  getMissingStickers,
  getOwnedStickers,
  getRepeatedExtras,
  getRepeatedStickers,
  getStatsByCollection,
  getStickerQuantity,
  getTradeItemTotal,
  groupByCountry,
  importProgressFromJson,
  serializeFullProgress,
  STORAGE_KEY,
  TRADE_HISTORY_STORAGE_KEY,
} from "./lib/album";
import { downloadTextFile } from "./lib/files";
import type { Filters, Progress, Sticker, TradeItem, TradeRecord } from "./types";

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

const formatDateTimeLocal = (date: Date) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
};

function App() {
  const [catalog, setCatalog] = useState<Sticker[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [selectedCollection, setSelectedCollection] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>(() => {
    const stored = localStorage.getItem(TRADE_HISTORY_STORAGE_KEY);

    if (!stored) {
      return [];
    }

    try {
      const parsed = JSON.parse(stored) as TradeRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
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

  useEffect(() => {
    localStorage.setItem(TRADE_HISTORY_STORAGE_KEY, JSON.stringify(tradeHistory));
  }, [tradeHistory]);

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
          <h1>FIFA World Cup 2026</h1>
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
        <RepeatedView
          catalog={catalog}
          filters={filters}
          progress={progress}
          tradeHistory={tradeHistory}
          onFiltersChange={setFilters}
          setProgress={setProgress}
          setTradeHistory={setTradeHistory}
        />
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
  tradeHistory,
  onFiltersChange,
  setProgress,
  setTradeHistory,
}: {
  catalog: Sticker[];
  filters: Filters;
  progress: Progress;
  tradeHistory: TradeRecord[];
  onFiltersChange: (filters: Filters) => void;
  setProgress: React.Dispatch<React.SetStateAction<Progress>>;
  setTradeHistory: React.Dispatch<React.SetStateAction<TradeRecord[]>>;
}) {
  const stickers = applyFilters(catalog, progress, { ...filters, status: "repeated" });
  const groups = groupByCountry(stickers);
  const [copyLabel, setCopyLabel] = useState("Copiar lista para intercambio");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [dateTime, setDateTime] = useState(formatDateTimeLocal(new Date()));
  const [tradedWith, setTradedWith] = useState("");
  const [notes, setNotes] = useState("");
  const [gave, setGave] = useState<TradeItem[]>([]);
  const [received, setReceived] = useState<TradeItem[]>([]);
  const [gaveSearch, setGaveSearch] = useState("");
  const [receivedSearch, setReceivedSearch] = useState("");
  const [tradeMessage, setTradeMessage] = useState("");
  const [copiedTradeId, setCopiedTradeId] = useState("");

  const copyTradeList = async () => {
    await navigator.clipboard.writeText(createTradingText(catalog, progress));
    setCopyLabel("Lista copiada");
    window.setTimeout(() => setCopyLabel("Copiar lista para intercambio"), 1800);
  };

  const addTradeItem = (side: "gave" | "received", code: string) => {
    const setter = side === "gave" ? setGave : setReceived;
    setter((items) => {
      const existingItem = items.find((item) => item.code === code);

      if (existingItem) {
        return items.map((item) => (item.code === code ? { ...item, quantity: item.quantity + 1 } : item));
      }

      return [...items, { code, quantity: 1 }];
    });
  };

  const updateTradeItem = (side: "gave" | "received", code: string, quantity: number) => {
    const setter = side === "gave" ? setGave : setReceived;
    setter((items) =>
      items.map((item) => (item.code === code ? { ...item, quantity: Math.max(1, Math.floor(quantity) || 1) } : item)),
    );
  };

  const removeTradeItem = (side: "gave" | "received", code: string) => {
    const setter = side === "gave" ? setGave : setReceived;
    setter((items) => items.filter((item) => item.code !== code));
  };

  const validateTrade = () => {
    if (gave.length === 0 || received.length === 0) {
      return "Agrega al menos una estampa en Doy y una en Recibo.";
    }

    const invalidQuantity = [...gave, ...received].find((item) => !Number.isInteger(item.quantity) || item.quantity < 1);

    if (invalidQuantity) {
      return "Las cantidades deben ser enteros positivos.";
    }

    const invalidGaveItem = gave.find((item) => item.quantity > Math.max(0, getStickerQuantity(item.code, progress) - 1));

    if (invalidGaveItem) {
      const availableExtras = Math.max(0, getStickerQuantity(invalidGaveItem.code, progress) - 1);
      return `Solo tienes ${availableExtras} extra(s) disponible(s) de ${invalidGaveItem.code}`;
    }

    return "";
  };

  const confirmTrade = () => {
    const validationMessage = validateTrade();

    if (validationMessage) {
      setTradeMessage(validationMessage);
      return;
    }

    const trade: TradeRecord = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      createdAt: dateTime || formatDateTimeLocal(new Date()),
      tradedWith: tradedWith.trim() || undefined,
      notes: notes.trim() || undefined,
      gave,
      received,
    };

    setProgress((currentProgress) => applyTradeToProgress(currentProgress, trade));
    setTradeHistory((currentHistory) => [trade, ...currentHistory]);
    setDateTime(formatDateTimeLocal(new Date()));
    setTradedWith("");
    setNotes("");
    setGave([]);
    setReceived([]);
    setGaveSearch("");
    setReceivedSearch("");
    setTradeMessage("Intercambio registrado.");
  };

  const copyTradeRecord = async (trade: TradeRecord) => {
    await navigator.clipboard.writeText(createTradeSummary(trade));
    setCopiedTradeId(trade.id);
    window.setTimeout(() => setCopiedTradeId(""), 1800);
  };

  const deleteTradeRecord = (tradeId: string) => {
    if (window.confirm("¿Eliminar este intercambio del historial?")) {
      setTradeHistory((currentHistory) => currentHistory.filter((trade) => trade.id !== tradeId));
    }
  };

  const gaveTotal = getTradeItemTotal(gave);
  const receivedTotal = getTradeItemTotal(received);

  return (
    <section className="view-stack">
      <FilterBar catalog={catalog} filters={{ ...filters, status: "repeated" }} onChange={onFiltersChange} showStatus={false} />
      <div className="trade-action-row">
        <button className="primary-button wide-button" onClick={() => setIsFormOpen((current) => !current)}>
          Registrar intercambio
        </button>
        <button className="ghost-button wide-button" onClick={copyTradeList}>
          {copyLabel}
        </button>
      </div>

      {isFormOpen ? (
        <section className="panel trade-form">
          <div className="section-heading flush">
            <h2>Registrar intercambio</h2>
            <span>
              Doy: {gaveTotal} estampas · Recibo: {receivedTotal} estampas
            </span>
          </div>
          {gaveTotal !== receivedTotal && gaveTotal > 0 && receivedTotal > 0 ? <p className="trade-note">Intercambio no parejo</p> : null}

          <div className="trade-meta-grid">
            <label>
              <span>Fecha y hora</span>
              <input
                type="datetime-local"
                value={dateTime}
                placeholder={formatDateTimeLocal(new Date())}
                onChange={(event) => setDateTime(event.target.value)}
              />
            </label>
            <label>
              <span>Con quién intercambié</span>
              <input value={tradedWith} placeholder="Nombre o apodo" onChange={(event) => setTradedWith(event.target.value)} />
            </label>
          </div>
          <label>
            <span>Notas</span>
            <textarea
              value={notes}
              placeholder="Ej. Cambiamos después del entrenamiento"
              rows={3}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          <div className="trade-builder-grid">
            <TradeBuilder
              title="Doy"
              mode="gave"
              catalog={catalog}
              progress={progress}
              items={gave}
              search={gaveSearch}
              onSearchChange={setGaveSearch}
              onAdd={(code) => addTradeItem("gave", code)}
              onUpdateQuantity={(code, quantity) => updateTradeItem("gave", code, quantity)}
              onRemove={(code) => removeTradeItem("gave", code)}
            />
            <TradeBuilder
              title="Recibo"
              mode="received"
              catalog={catalog}
              progress={progress}
              items={received}
              search={receivedSearch}
              onSearchChange={setReceivedSearch}
              onAdd={(code) => addTradeItem("received", code)}
              onUpdateQuantity={(code, quantity) => updateTradeItem("received", code, quantity)}
              onRemove={(code) => removeTradeItem("received", code)}
            />
          </div>

          <button className="primary-button wide-button" onClick={confirmTrade}>
            Confirmar intercambio
          </button>
          {tradeMessage ? <p className={tradeMessage === "Intercambio registrado." ? "toast-message" : "warning-message"}>{tradeMessage}</p> : null}
        </section>
      ) : null}

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

      <section className="panel trade-history">
        <h2>Historial de intercambios</h2>
        <p className="history-note">Eliminar del historial no revierte las cantidades del álbum.</p>
        {tradeHistory.length === 0 ? <p className="empty-state">Todavía no hay intercambios registrados.</p> : null}
        <div className="trade-history-list">
          {tradeHistory.map((trade) => {
            const uneven = getTradeItemTotal(trade.gave) !== getTradeItemTotal(trade.received);

            return (
              <article className="trade-history-card" key={trade.id}>
                <div className="section-heading flush">
                  <h3>{trade.tradedWith ? `Intercambio con ${trade.tradedWith}` : "Intercambio"}</h3>
                  {uneven ? <span>Intercambio no parejo</span> : null}
                </div>
                <p>Fecha: {trade.createdAt.replace("T", " ")}</p>
                <p>
                  <strong>Di:</strong> {formatTradeItems(trade.gave)}
                </p>
                <p>
                  <strong>Recibí:</strong> {formatTradeItems(trade.received)}
                </p>
                {trade.notes ? <p>Notas: {trade.notes}</p> : null}
                <div className="quick-actions">
                  <button className="ghost-button" onClick={() => copyTradeRecord(trade)}>
                    {copiedTradeId === trade.id ? "Resumen copiado" : "Copiar resumen"}
                  </button>
                  <button className="danger-button" onClick={() => deleteTradeRecord(trade.id)}>
                    Eliminar del historial
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function TradeBuilder({
  title,
  mode,
  catalog,
  progress,
  items,
  search,
  onSearchChange,
  onAdd,
  onUpdateQuantity,
  onRemove,
}: {
  title: string;
  mode: "gave" | "received";
  catalog: Sticker[];
  progress: Progress;
  items: TradeItem[];
  search: string;
  onSearchChange: (query: string) => void;
  onAdd: (code: string) => void;
  onUpdateQuantity: (code: string, quantity: number) => void;
  onRemove: (code: string) => void;
}) {
  const selectedCodes = new Set(items.map((item) => item.code));
  const normalizedSearch = search
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
  const candidates = catalog
    .filter((sticker) => {
      if (mode === "gave" && getStickerQuantity(sticker.code, progress) <= 1) {
        return false;
      }

      const searchable = [sticker.code, getCollectionName(sticker), sticker.country, sticker.group, sticker.section, sticker.number, sticker.displayName]
        .filter(Boolean)
        .join(" ")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase();

      return !normalizedSearch || searchable.includes(normalizedSearch);
    })
    .sort((a, b) => {
      if (mode === "gave") {
        return getStickerQuantity(b.code, progress) - getStickerQuantity(a.code, progress) || a.code.localeCompare(b.code);
      }

      const aQuantity = getStickerQuantity(a.code, progress);
      const bQuantity = getStickerQuantity(b.code, progress);
      const aRank = aQuantity === 0 ? 0 : aQuantity === 1 ? 1 : 2;
      const bRank = bQuantity === 0 ? 0 : bQuantity === 1 ? 1 : 2;
      return aRank - bRank || getCollectionName(a).localeCompare(getCollectionName(b), "es") || a.code.localeCompare(b.code);
    })
    .slice(0, 12);

  return (
    <section className="trade-builder">
      <h3>{title}</h3>
      <label>
        <span>Agregar estampa</span>
        <input
          type="search"
          value={search}
          placeholder="Código, colección o equipo"
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <div className="selected-trade-list">
        {items.length === 0 ? <p className="empty-state">Sin estampas seleccionadas.</p> : null}
        {items.map((item) => {
          const sticker = catalog.find((candidate) => candidate.code === item.code);
          const availableExtras = Math.max(0, getStickerQuantity(item.code, progress) - 1);
          const hasWarning = mode === "gave" && item.quantity > availableExtras;

          return (
            <div className="selected-trade-item" key={item.code}>
              <div>
                <strong>{item.code}</strong>
                <span>{sticker ? getCollectionName(sticker) : ""}</span>
                {hasWarning ? <small>Solo tienes {availableExtras} extra(s) disponible(s) de {item.code}</small> : null}
              </div>
              <input
                type="number"
                min="1"
                value={item.quantity}
                aria-label={`Cantidad de ${item.code}`}
                onChange={(event) => onUpdateQuantity(item.code, Number(event.target.value))}
              />
              <button className="ghost-button small" onClick={() => onRemove(item.code)}>
                Quitar
              </button>
            </div>
          );
        })}
      </div>
      <div className="trade-candidates">
        {candidates.map((sticker) => {
          const quantity = getStickerQuantity(sticker.code, progress);
          const extras = Math.max(0, quantity - 1);

          return (
            <button
              className="trade-candidate"
              key={sticker.code}
              onClick={() => onAdd(sticker.code)}
              disabled={selectedCodes.has(sticker.code) && mode === "gave" && items.find((item) => item.code === sticker.code)?.quantity === extras}
            >
              <strong>{sticker.code}</strong>
              <span>{getCollectionName(sticker)}</span>
              <small>{mode === "gave" ? `${extras} extra(s) disponible(s)` : quantity === 0 ? "Faltante" : `Cantidad actual: ${quantity}`}</small>
            </button>
          );
        })}
      </div>
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
