import { useEffect, useMemo, useState } from "react";
import { FilterBar } from "./components/FilterBar";
import { StickerList } from "./components/StickerList";
import { useAlbumData, type SyncStatus } from "./hooks/useAlbumData";
import { useAuth } from "./hooks/useAuth";
import {
  applyFilters,
  applyTradeToProgress,
  createTradeSummary,
  createTradingText,
  exportMissingToCsv,
  exportMissingToMarkdown,
  exportProgressToJson,
  exportRepeatedToCsv,
  exportRepeatedToMarkdown,
  formatTradeItems,
  getCompletionPercentage,
  getCollectionName,
  getRealGroups,
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

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const IMPORT_EXAMPLE = `{
  "MEX1": 1,
  "MEX2": 0,
  "MEX3": 2,
  "FWC5": 1,
  "CC4": 3
}`;

const CHATGPT_CONVERSION_PROMPT = `Tengo un archivo/lista/exportación de stickers de otra app y quiero convertirlo al formato JSON de mi tracker del álbum FIFA World Cup 2026.

Formato de salida requerido:
{
  "MEX1": 1,
  "MEX2": 0,
  "MEX3": 2
}

Reglas:
- Devuelve únicamente JSON válido, sin explicación, sin markdown y sin texto extra.
- Las llaves deben ser códigos exactos de estampas.
- Los valores deben ser números enteros con la cantidad total que tengo.
- 0 significa que me falta.
- 1 significa que la tengo.
- 2 o más significa que tengo repetidas.
- Si una estampa aparece como “owned”, “tengo”, “pegada”, “collected” o similar, usa 1.
- Si aparece como “missing”, “faltante” o similar, usa 0.
- Si aparece con duplicados, extras o repeated, usa la cantidad total que tengo, no solo las extras.
  Ejemplo: si tengo 1 pegada y 2 repetidas, el valor debe ser 3.
- Ignora cualquier campo que no sea necesario.
- Si hay códigos desconocidos o ambiguos, crea una sección separada llamada "_unknown" con esos elementos.

Aquí está la información exportada desde otra app:
[PEGA AQUÍ TU EXPORTACIÓN]`;

function App() {
  const auth = useAuth();
  const [catalog, setCatalog] = useState<Sticker[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [selectedCollection, setSelectedCollection] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [showHelp, setShowHelp] = useState(false);
  const {
    addTrade,
    combineLocalAndCloudData,
    deleteTrade,
    migrationPrompt,
    progress,
    setProgress,
    syncStatus,
    tradeHistory,
    uploadLocalData,
    useCloudData,
  } = useAlbumData({
    isCloudEnabled: auth.isConfigured,
    userId: auth.user?.id,
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
        <div className="header-actions">
          <div className="completion-ring" aria-label={`Avance ${dashboard.completion}%`}>
            {dashboard.completion}%
          </div>
          <button
            className="help-button"
            type="button"
            aria-controls="help-panel"
            aria-expanded={showHelp}
            onClick={() => setShowHelp((current) => !current)}
          >
            Ayuda
          </button>
        </div>
      </header>
      {showHelp ? <HelpPanel /> : null}
      <AuthPanel
        authMessage={auth.authMessage}
        isConfigured={auth.isConfigured}
        isLoading={auth.isLoading}
        syncStatus={syncStatus}
        userEmail={auth.user?.email}
        onSendMagicLink={auth.sendMagicLink}
        onSignOut={auth.signOut}
      />
      {migrationPrompt ? (
        <MigrationPanel
          type={migrationPrompt.type}
          onCombine={combineLocalAndCloudData}
          onUploadLocal={uploadLocalData}
          onUseCloud={useCloudData}
        />
      ) : null}

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
          onOpenCollection={(collectionName) => {
            setSelectedCollection(collectionName);
            setActiveView("paises");
          }}
        />
      ) : null}
      {activeView === "repetidas" ? (
        <RepeatedView
          catalog={catalog}
          filters={filters}
          progress={progress}
          tradeHistory={tradeHistory}
          onFiltersChange={setFilters}
          onAddTrade={addTrade}
          onDeleteTrade={deleteTrade}
          setProgress={setProgress}
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
      <AppFooter />
    </main>
  );
}

function HelpPanel() {
  return (
    <section className="panel help-panel" id="help-panel" aria-label="¿Cómo funciona?">
      <div>
        <p className="eyebrow">¿Cómo funciona?</p>
        <h2>Guía rápida del tracker</h2>
      </div>
      <ul className="info-list">
        <li>
          <strong>0 = Faltante.</strong> Todavía no tienes esa estampa.
        </li>
        <li>
          <strong>1 = La tengo.</strong> Ya cuentas con una copia para tu álbum.
        </li>
        <li>
          <strong>2+ = Repetida.</strong> Tienes copias extra para cambiar.
        </li>
        <li>
          <strong>Extras para cambiar = cantidad - 1.</strong> Sólo las repetidas/extras están disponibles para intercambio.
        </li>
        <li>Tu progreso se guarda automáticamente mientras registras estampas.</li>
        <li>Sin iniciar sesión, tus datos se guardan localmente en este navegador y dispositivo.</li>
        <li>Con sesión, tu progreso se sincroniza en la nube y también queda una copia local como respaldo.</li>
      </ul>
      <div className="storage-note">
        <strong>¿Dónde se guarda mi progreso?</strong>
        <p>
          La app es gratis y su código fuente es público en GitHub. En modo nube, los datos están protegidos por inicio de sesión y reglas de
          acceso.
        </p>
      </div>
    </section>
  );
}

function AppFooter() {
  return (
    <footer className="app-footer">
      <strong>Sticker Album Tracker FWC 2026</strong>
      <span>Hecho por Julio Vivas</span>
      <nav aria-label="Enlaces del proyecto">
        <a href="https://github.com/Dino-Julius/my-sticker-album-tracker-fwc-2026" target="_blank" rel="noreferrer">
          Código fuente disponible en GitHub
        </a>
        <a href="https://dino-julius.github.io/my-sticker-album-tracker-fwc-2026/" target="_blank" rel="noreferrer">
          App en GitHub Pages
        </a>
      </nav>
      <p>Datos guardados localmente o en Supabase si inicias sesión.</p>
      <p>Proyecto personal. No afiliado oficialmente con FIFA, Panini ni Coca-Cola.</p>
    </footer>
  );
}

function AuthPanel({
  authMessage,
  isConfigured,
  isLoading,
  syncStatus,
  userEmail,
  onSendMagicLink,
  onSignOut,
}: {
  authMessage: string;
  isConfigured: boolean;
  isLoading: boolean;
  syncStatus: SyncStatus;
  userEmail?: string;
  onSendMagicLink: (email: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const trimmedEmail = email.trim();
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const showEmailError = trimmedEmail.length > 0 && !isEmailValid;
  const syncLabel =
    syncStatus === "saving"
      ? "Guardando..."
      : syncStatus === "cloud"
        ? "Guardado en la nube"
        : syncStatus === "error"
          ? "Error al sincronizar"
          : "Usando almacenamiento local";

  if (!isConfigured) {
    return (
      <section className="auth-panel">
        <span>{syncLabel}</span>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="auth-panel">
        <span>Revisando sesión...</span>
      </section>
    );
  }

  if (userEmail) {
    return (
      <section className="auth-panel">
        <div>
          <span>{syncLabel}</span>
          <strong>Sesión iniciada como {userEmail}</strong>
        </div>
        <button className="ghost-button small" onClick={onSignOut}>
          Cerrar sesión
        </button>
        {authMessage ? <p>{authMessage}</p> : null}
      </section>
    );
  }

  return (
    <section className="auth-panel">
      <div>
        <span>{syncLabel}</span>
        <strong>Iniciar sesión</strong>
      </div>
      <label className="auth-email-field">
        <span>Correo</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          value={email}
          aria-invalid={showEmailError}
          onChange={(event) => setEmail(event.target.value)}
        />
        {showEmailError ? <small className="field-error">Escribe un correo válido.</small> : null}
      </label>
      <button className="primary-button small" onClick={() => onSendMagicLink(trimmedEmail)} disabled={!isEmailValid}>
        Enviar enlace mágico
      </button>
      {authMessage ? <p>{authMessage}</p> : null}
    </section>
  );
}

function MigrationPanel({
  type,
  onCombine,
  onUploadLocal,
  onUseCloud,
}: {
  type: "upload-local" | "resolve-conflict";
  onCombine: () => void;
  onUploadLocal: () => void;
  onUseCloud: () => void;
}) {
  return (
    <section className="migration-panel">
      <div>
        <strong>{type === "upload-local" ? "Datos locales encontrados" : "Datos locales y de nube encontrados"}</strong>
        <p>
          {type === "upload-local"
            ? "Puedes subir tu progreso local a la nube. El almacenamiento local se conserva como respaldo."
            : "Elige cómo resolver la diferencia. El almacenamiento local se conserva como respaldo."}
        </p>
      </div>
      <div className="quick-actions">
        {type === "resolve-conflict" ? (
          <button className="ghost-button" onClick={onUseCloud}>
            Usar nube
          </button>
        ) : null}
        <button className="ghost-button" onClick={onUploadLocal}>
          {type === "upload-local" ? "Subir datos locales a la nube" : "Subir local"}
        </button>
        {type === "resolve-conflict" ? (
          <button className="primary-button" onClick={onCombine}>
            Combinar
          </button>
        ) : null}
      </div>
    </section>
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
  onOpenCollection,
}: {
  title: string;
  catalog: Sticker[];
  filters: Filters;
  progress: Progress;
  stickers: Sticker[];
  onFiltersChange: (filters: Filters) => void;
  onOpenCollection: (collectionName: string) => void;
}) {
  const groups = groupByCountry(stickers);
  const [copiedCollection, setCopiedCollection] = useState("");

  const copyCollectionMissing = async (collectionName: string, collectionStickers: Sticker[]) => {
    const text = `Faltantes de ${collectionName}: ${collectionStickers.map((sticker) => sticker.code).join(", ")}`;
    await navigator.clipboard.writeText(text);
    setCopiedCollection(collectionName);
    window.setTimeout(() => setCopiedCollection(""), 1800);
  };

  return (
    <section className="view-stack">
      <FilterBar catalog={catalog} filters={filters} onChange={onFiltersChange} showStatus={false} />
      <div className="section-heading">
        <h2>{title}</h2>
        <span>{stickers.length} estampas</span>
      </div>
      <div className="grouped-list">
        {[...groups.entries()].map(([country, countryStickers]) => (
          <article className="panel missing-group-card" key={country}>
            <button className="missing-group-main" onClick={() => onOpenCollection(country)}>
              <h3>
                {country} — faltan {countryStickers.length}
              </h3>
              <p className="code-list">{countryStickers.map((sticker) => sticker.code).join(", ")}</p>
            </button>
            <button className="ghost-button small" onClick={() => copyCollectionMissing(country, countryStickers)}>
              {copiedCollection === country ? "Copiado" : "Copiar"}
            </button>
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
  onAddTrade,
  onDeleteTrade,
  onFiltersChange,
  setProgress,
}: {
  catalog: Sticker[];
  filters: Filters;
  progress: Progress;
  tradeHistory: TradeRecord[];
  onAddTrade: (trade: TradeRecord) => void;
  onDeleteTrade: (tradeId: string) => void;
  onFiltersChange: (filters: Filters) => void;
  setProgress: React.Dispatch<React.SetStateAction<Progress>>;
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
    onAddTrade(trade);
    setDateTime(formatDateTimeLocal(new Date()));
    setTradedWith("");
    setNotes("");
    setGave([]);
    setReceived([]);
    setGaveSearch("");
    setReceivedSearch("");
    setTradeMessage("Intercambio registrado.");
    setIsFormOpen(false);
  };

  const cancelTrade = () => {
    setDateTime(formatDateTimeLocal(new Date()));
    setTradedWith("");
    setNotes("");
    setGave([]);
    setReceived([]);
    setGaveSearch("");
    setReceivedSearch("");
    setTradeMessage("");
    setIsFormOpen(false);
  };

  const copyTradeRecord = async (trade: TradeRecord) => {
    await navigator.clipboard.writeText(createTradeSummary(trade));
    setCopiedTradeId(trade.id);
    window.setTimeout(() => setCopiedTradeId(""), 1800);
  };

  const deleteTradeRecord = (tradeId: string) => {
    if (window.confirm("¿Eliminar este intercambio del historial?")) {
      onDeleteTrade(tradeId);
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
          <button className="ghost-button wide-button" onClick={cancelTrade}>
            Cancelar intercambio
          </button>
        </section>
      ) : null}
      {tradeMessage ? <p className={tradeMessage === "Intercambio registrado." ? "toast-message" : "warning-message"}>{tradeMessage}</p> : null}

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
  const [quickFilter, setQuickFilter] = useState<"all" | "collection" | "group">("all");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
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

      if (quickFilter === "collection" && collectionFilter && getCollectionName(sticker) !== collectionFilter) {
        return false;
      }

      if (quickFilter === "group" && groupFilter && sticker.group !== groupFilter) {
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
  const collectionOptions = getStatsByCollection(catalog, progress).map((collection) => collection.name);
  const groupOptions = getRealGroups(catalog);

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
      <div className="quick-filter-row" aria-label={`Filtros rápidos de ${title}`}>
        <button className={quickFilter === "all" ? "primary-button small" : "ghost-button small"} onClick={() => setQuickFilter("all")}>
          Todas
        </button>
        <button
          className={quickFilter === "collection" ? "primary-button small" : "ghost-button small"}
          onClick={() => setQuickFilter("collection")}
        >
          Colección
        </button>
        <button className={quickFilter === "group" ? "primary-button small" : "ghost-button small"} onClick={() => setQuickFilter("group")}>
          Grupo
        </button>
      </div>
      <div className="trade-filter-selectors">
        <label>
          <span>Filtrar por colección</span>
          <select
            value={collectionFilter}
            onChange={(event) => setCollectionFilter(event.target.value)}
            disabled={quickFilter !== "collection"}
          >
            <option value="">Todas</option>
            {collectionOptions.map((collection) => (
              <option key={collection} value={collection}>
                {collection}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Filtrar por grupo</span>
          <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} disabled={quickFilter !== "group"}>
            <option value="">Todos</option>
            {groupOptions.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </label>
      </div>
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
  const normalizedCollectionQuery = normalizeText(collectionQuery);
  const visibleCollections = normalizedCollectionQuery
    ? stats.filter((item) => normalizeText(item.name).includes(normalizedCollectionQuery))
    : stats;
  const selectOptions = visibleCollections.length > 0 ? visibleCollections : stats;

  useEffect(() => {
    const exactMatch = stats.find((item) => normalizeText(item.name) === normalizedCollectionQuery);
    const singleMatch = visibleCollections.length === 1 ? visibleCollections[0] : undefined;
    const nextCollection = exactMatch ?? singleMatch;

    if (normalizedCollectionQuery && nextCollection && nextCollection.name !== collection) {
      onSelectedCollectionChange(nextCollection.name);
    }
  }, [collection, normalizedCollectionQuery, onSelectedCollectionChange, stats, visibleCollections]);

  const selectCollection = (collectionName: string) => {
    onSelectedCollectionChange(collectionName);
    setCollectionQuery(collectionName);
  };

  const updateCollectionQuery = (query: string) => {
    setCollectionQuery(query);

    if (!query.trim() && !selectedCollection && stats[0]) {
      onSelectedCollectionChange(stats[0].name);
    }
  };

  return (
    <section className="view-stack">
      <section className="panel collection-selector-panel">
        <label className="search-field">
          <span>Buscar colección</span>
          <input
            type="search"
            placeholder="FIFA / FWC, Coca-Cola o selección"
            value={collectionQuery}
            onChange={(event) => updateCollectionQuery(event.target.value)}
          />
        </label>
        <label>
          <span>Colección</span>
          <select value={collection} onChange={(event) => selectCollection(event.target.value)}>
            {selectOptions.map((item) => (
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
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string; action?: string } | null>(null);

  const notify = (text: string, type: "success" | "error" = "success", action?: string) => {
    setFeedback({ type, text, action });
    window.setTimeout(() => setFeedback((current) => (current?.text === text ? null : current)), 4200);
  };

  const actionClass = (baseClass: string, action: string) => {
    if (feedback?.action !== action) {
      return baseClass;
    }

    return `${baseClass} ${feedback.type === "success" ? "success-button" : "error-button"}`;
  };

  const importTextProgress = (jsonText: string) => {
    try {
      setProgress(importProgressFromJson(jsonText, catalog));
      notify("Progreso importado correctamente.", "success", "import");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo importar el progreso.", "error", "import");
    }
  };

  const copyText = async (text: string, successText: string, action: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(successText, "success", action);
    } catch {
      notify("No se pudo copiar al portapapeles.", "error", action);
    }
  };

  const downloadFile = (filename: string, content: string, type: string, action: string) => {
    downloadTextFile(filename, content, type);
    notify("Archivo descargado.", "success", action);
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
      notify("Progreso reiniciado.", "success", "reset");
    }
  };
  const exportActions = new Set(["download-progress", "copy-progress", "download-missing", "copy-missing", "download-repeated", "copy-repeated"]);
  const exportFeedback = exportActions.has(feedback?.action ?? "") ? feedback : null;
  const conversionFeedback = feedback?.action === "copy-conversion-prompt" ? feedback : null;
  const importFeedback = feedback?.action === "import" ? feedback : null;
  const resetFeedback = feedback?.action === "reset" ? feedback : null;

  return (
    <section className="view-stack">
      <section className="panel action-panel import-guidance">
        <h2>¿Tienes tus stickers en otra app?</h2>
        <p>Puedes exportar tu lista desde otra app y convertirla al formato de este tracker.</p>
        <pre className="code-example">{IMPORT_EXAMPLE}</pre>
        <ul className="info-list">
          <li>La llave es el código de la estampa.</li>
          <li>El valor es la cantidad total que tienes.</li>
          <li>0 = Faltante, 1 = La tengo, 2+ = Repetida.</li>
          <li>Sólo se necesita el código y la cantidad.</li>
        </ul>
        <button
          className={actionClass("ghost-button", "copy-conversion-prompt")}
          onClick={() => copyText(CHATGPT_CONVERSION_PROMPT, "Prompt copiado", "copy-conversion-prompt")}
        >
          {feedback?.action === "copy-conversion-prompt" ? "Prompt copiado" : "Copiar prompt de conversión"}
        </button>
        {conversionFeedback ? (
          <p className={conversionFeedback.type === "success" ? "toast-message" : "warning-message"}>{conversionFeedback.text}</p>
        ) : null}
      </section>

      <section className="panel action-panel">
        <h2>Exportar</h2>
        <button
          className={actionClass("primary-button", "download-progress")}
          onClick={() =>
            downloadFile(
              "progreso-my-sticker-album-tracker-fwc-2026.json",
              exportProgressToJson(catalog, progress),
              "application/json",
              "download-progress",
            )
          }
        >
          {feedback?.action === "download-progress" ? "Archivo descargado" : "Exportar progreso JSON"}
        </button>
        <button
          className={actionClass("ghost-button", "copy-progress")}
          onClick={() => copyText(exportProgressToJson(catalog, progress), "JSON copiado al portapapeles.", "copy-progress")}
        >
          {feedback?.action === "copy-progress" ? "Copiado" : "Copiar progreso JSON"}
        </button>
        <button
          className={actionClass("ghost-button", "download-missing")}
          onClick={() =>
            downloadFile("faltantes-my-sticker-album-tracker-fwc-2026.csv", exportMissingToCsv(catalog, progress), "text/csv", "download-missing")
          }
        >
          {feedback?.action === "download-missing" ? "Archivo descargado" : "Exportar faltantes CSV"}
        </button>
        <button
          className={actionClass("ghost-button", "copy-missing")}
          onClick={() => copyText(exportMissingToMarkdown(catalog, progress), "Tabla de faltantes copiada.", "copy-missing")}
        >
          {feedback?.action === "copy-missing" ? "Copiado" : "Copiar faltantes como tabla"}
        </button>
        <button
          className={actionClass("ghost-button", "download-repeated")}
          onClick={() =>
            downloadFile("repetidas-my-sticker-album-tracker-fwc-2026.csv", exportRepeatedToCsv(catalog, progress), "text/csv", "download-repeated")
          }
        >
          {feedback?.action === "download-repeated" ? "Archivo descargado" : "Exportar repetidas CSV"}
        </button>
        <button
          className={actionClass("ghost-button", "copy-repeated")}
          onClick={() => copyText(exportRepeatedToMarkdown(catalog, progress), "Tabla de repetidas copiada.", "copy-repeated")}
        >
          {feedback?.action === "copy-repeated" ? "Copiado" : "Copiar repetidas como tabla"}
        </button>
        {exportFeedback ? <p className={exportFeedback.type === "success" ? "toast-message" : "warning-message"}>{exportFeedback.text}</p> : null}
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
        <button className={actionClass("primary-button", "import")} onClick={() => importTextProgress(importText)}>
          {feedback?.action === "import" && feedback.type === "success" ? "Importado correctamente" : "Importar JSON pegado"}
        </button>
        {importFeedback ? <p className={importFeedback.type === "success" ? "toast-message" : "warning-message"}>{importFeedback.text}</p> : null}
      </section>

      <section className="panel action-panel">
        <h2>¿Dónde se guarda mi progreso?</h2>
        <p>
          Sin iniciar sesión, tu progreso se guarda en el almacenamiento local de este navegador. Es gratis, rápido y privado, pero sólo existe en
          este dispositivo/navegador. Si limpias datos del navegador, podrías perderlo.
        </p>
        <p>
          Con sesión, tu progreso se sincroniza en la nube para usarlo desde tu celular, computadora u otro navegador. También se guarda una copia
          local como respaldo.
        </p>
        <p>
          El código fuente es público en GitHub. La publishable key de Supabase es pública y apta para frontend; los datos se protegen con inicio de
          sesión y reglas de acceso RLS. La service_role key nunca se debe exponer.
        </p>
      </section>

      <section className="panel action-panel">
        <h2>Reiniciar</h2>
        <button className={actionClass("danger-button", "reset")} onClick={resetProgress}>
          Reiniciar progreso
        </button>
        <p>
          El catálogo maestro no se modifica. Se guardan {Object.keys(serializeFullProgress(catalog, progress)).length} códigos en el
          respaldo exportado.
        </p>
        {resetFeedback ? <p className={resetFeedback.type === "success" ? "toast-message" : "warning-message"}>{resetFeedback.text}</p> : null}
      </section>
    </section>
  );
}

export default App;
