import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { FilterBar } from "./components/FilterBar";
import { StickerList } from "./components/StickerList";
import { useAlbumData, type MigrationPrompt, type SyncStatus } from "./hooks/useAlbumData";
import { useAuth } from "./hooks/useAuth";
import { useProfile } from "./hooks/useProfile";
import { parseBulkStickerText } from "./lib/bulk";
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
  formatCollectionCodeLabel,
  formatTradeItems,
  getCompletionPercentage,
  getCollectionName,
  getRealGroups,
  getMissingStickers,
  getOwnedStickers,
  getRepeatedExtras,
  getRepeatedStickers,
  getStatsByAlbumGroup,
  getStatsByCollection,
  getStickerQuantity,
  getTradeItemTotal,
  groupByCountry,
  importProgressFromJson,
  serializeFullProgress,
  sortStickersByAlbumOrder,
} from "./lib/album";
import { createTimestampedFilename, downloadTextFile } from "./lib/files";
import type {
  Filters,
  PendingTradeRecord,
  Progress,
  RegistrationEvent,
  RegistrationEventAction,
  RegistrationEventItem,
  RegistrationEventSource,
  Sticker,
  TradeItem,
  TradeRecord,
  UserProfile,
} from "./types";

const emptyFilters: Filters = {
  query: "",
  country: "",
  group: "",
  section: "",
  status: "all",
};

type View = "dashboard" | "registro" | "faltantes" | "repetidas" | "paises" | "datos";
type BulkAction = "increment" | "owned" | "missing" | "set";

const bulkActionToRegistrationAction: Record<BulkAction, RegistrationEventAction> = {
  increment: "increment",
  missing: "set-missing",
  owned: "set-owned",
  set: "set-quantity",
};

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

const createRegistrationEventId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

function createRegistrationItems(currentProgress: Progress, updates: Progress): RegistrationEventItem[] {
  return Object.entries(updates)
    .map(([code, quantity]) => {
      const before = getStickerQuantity(code, currentProgress);
      const after = Math.max(0, Math.floor(quantity));
      return { code, before, after, delta: after - before };
    })
    .filter((item) => item.before !== item.after)
    .sort((a, b) => a.code.localeCompare(b.code));
}

function createRegistrationEvent(
  source: RegistrationEventSource,
  action: RegistrationEventAction,
  items: RegistrationEventItem[],
  note?: string,
): RegistrationEvent {
  return {
    id: createRegistrationEventId(),
    createdAt: new Date().toISOString(),
    source,
    action,
    items,
    note,
  };
}

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
  const profileState = useProfile({ isCloudEnabled: auth.isConfigured, user: auth.user });
  const [catalog, setCatalog] = useState<Sticker[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [selectedCollection, setSelectedCollection] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [showHelp, setShowHelp] = useState(false);
  const [pwaUpdateWorker, setPwaUpdateWorker] = useState<ServiceWorker | null>(null);
  const {
    addPendingTrade,
    addRegistrationEvent,
    addTrade,
    cancelMigration,
    combineLocalAndCloudData,
    deleteRegistrationEvent,
    deletePendingTrade,
    deleteTrade,
    hasPendingCloudChanges,
    lastCloudSyncAt,
    lastLocalUpdateAt,
    migrationPrompt,
    pendingTrades,
    progress,
    registrationEvents,
    setProgress,
    syncNow,
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

  useEffect(() => {
    const handlePwaUpdate = (event: WindowEventMap["pwa-update-available"]) => {
      setPwaUpdateWorker(event.detail.worker);
    };

    window.addEventListener("pwa-update-available", handlePwaUpdate);

    return () => {
      window.removeEventListener("pwa-update-available", handlePwaUpdate);
    };
  }, []);

  const applyPwaUpdate = () => {
    if (!pwaUpdateWorker) {
      return;
    }

    let hasReloaded = false;
    const reloadWhenControlled = () => {
      if (hasReloaded) {
        return;
      }

      hasReloaded = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", reloadWhenControlled, { once: true });
    pwaUpdateWorker.postMessage({ type: "SKIP_WAITING" });
  };

  const dashboard = useMemo(() => {
    const owned = getOwnedStickers(catalog, progress);
    const missing = getMissingStickers(catalog, progress);
    const repeated = getRepeatedStickers(catalog, progress);
    const statsByCollection = getStatsByCollection(catalog, progress);
    const statsByAlbumGroup = getStatsByAlbumGroup(catalog, progress);

    return {
      total: catalog.length,
      owned: owned.length,
      missing: missing.length,
      repeated: repeated.length,
      repeatedExtras: getRepeatedExtras(catalog, progress),
      completion: getCompletionPercentage(catalog, progress),
      statsByAlbumGroup,
      statsByCollection,
      mostMissing: [...statsByCollection].sort((a, b) => b.missing - a.missing).slice(0, 5),
      closest: [...statsByCollection]
        .filter((collection) => collection.missing > 0)
        .sort((a, b) => b.completionPercentage - a.completionPercentage || a.missing - b.missing)
        .slice(0, 5),
    };
  }, [catalog, progress]);

  const filteredStickers = useMemo(() => applyFilters(catalog, progress, filters), [catalog, filters, progress]);

  const setQuantity = (code: string, quantity: number, source: RegistrationEventSource = "manual") => {
    const nextQuantity = Math.max(0, Math.floor(quantity));
    const items = createRegistrationItems(progress, { [code]: nextQuantity });

    if (items.length > 0) {
      const action: RegistrationEventAction =
        nextQuantity === 0 ? "set-missing" : nextQuantity === 1 ? "set-owned" : nextQuantity > getStickerQuantity(code, progress) ? "increment" : "set-quantity";
      addRegistrationEvent(createRegistrationEvent(source, action, items));
    }

    setProgress((current) => ({ ...current, [code]: nextQuantity }));
  };

  const setQuantities = (
    updates: Progress,
    source: RegistrationEventSource = "bulk",
    action: RegistrationEventAction = "set-quantity",
    note?: string,
  ) => {
    const items = createRegistrationItems(progress, updates);

    if (items.length > 0) {
      addRegistrationEvent(createRegistrationEvent(source, action, items, note));
    }

    setProgress((current) => {
      const nextProgress = { ...current };

      Object.entries(updates).forEach(([code, quantity]) => {
        nextProgress[code] = Math.max(0, Math.floor(quantity));
      });

      return nextProgress;
    });
  };

  const replaceProgressWithHistory = (nextProgress: Progress, source: RegistrationEventSource, action: RegistrationEventAction, note?: string) => {
    const codes = new Set([...Object.keys(progress), ...Object.keys(nextProgress)]);
    const updates = [...codes].reduce<Progress>((nextUpdates, code) => {
      nextUpdates[code] = nextProgress[code] ?? 0;
      return nextUpdates;
    }, {});
    const items = createRegistrationItems(progress, updates);

    if (items.length > 0) {
      addRegistrationEvent(createRegistrationEvent(source, action, items, note));
    }

    setProgress(nextProgress);
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
      {pwaUpdateWorker ? <PwaUpdateBanner onDismiss={() => setPwaUpdateWorker(null)} onUpdate={applyPwaUpdate} /> : null}
      <AuthPanel
        authMessage={auth.authMessage}
        isConfigured={auth.isConfigured}
        isLoading={auth.isLoading}
        hasPendingCloudChanges={hasPendingCloudChanges}
        isSavingProfile={profileState.isSavingProfile}
        lastCloudSyncAt={lastCloudSyncAt}
        lastLocalUpdateAt={lastLocalUpdateAt}
        profile={profileState.profile}
        profileMessage={profileState.profileMessage}
        syncStatus={syncStatus}
        userEmail={auth.user?.email}
        onSaveNickname={profileState.saveNickname}
        onSignInWithGoogle={auth.signInWithGoogle}
        onSignOut={auth.signOut}
        onSyncNow={syncNow}
      />
      {migrationPrompt ? (
        <MigrationPanel
          catalog={catalog}
          prompt={migrationPrompt}
          onCancel={cancelMigration}
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
          catalog={catalog}
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
          registrationEvents={registrationEvents}
          onFiltersChange={setFilters}
          onDeleteRegistrationEvent={deleteRegistrationEvent}
          onSetQuantity={setQuantity}
          onSetQuantities={setQuantities}
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
          pendingTrades={pendingTrades}
          progress={progress}
          tradeHistory={tradeHistory}
          onFiltersChange={setFilters}
          onAddPendingTrade={addPendingTrade}
          onAddTrade={addTrade}
          onDeletePendingTrade={deletePendingTrade}
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
          onSetQuantity={(code, quantity) => setQuantity(code, quantity, "collection")}
        />
      ) : null}
      {activeView === "datos" ? <DataView catalog={catalog} progress={progress} onReplaceProgress={replaceProgressWithHistory} /> : null}
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
          <strong>1 = Tengo.</strong> Ya cuentas con una copia para tu álbum.
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

function PwaUpdateBanner({ onDismiss, onUpdate }: { onDismiss: () => void; onUpdate: () => void }) {
  return (
    <section className="pwa-update-banner" aria-live="polite">
      <div>
        <strong>Nueva versión disponible</strong>
        <span>Actualiza para usar la última versión de la app.</span>
      </div>
      <div className="pwa-update-actions">
        <button className="primary-button small" onClick={onUpdate}>
          Actualizar
        </button>
        <button className="ghost-button small" onClick={onDismiss}>
          Después
        </button>
      </div>
    </section>
  );
}

function AuthPanel({
  authMessage,
  hasPendingCloudChanges,
  isConfigured,
  isLoading,
  isSavingProfile,
  lastCloudSyncAt,
  lastLocalUpdateAt,
  profile,
  profileMessage,
  syncStatus,
  userEmail,
  onSaveNickname,
  onSignInWithGoogle,
  onSignOut,
  onSyncNow,
}: {
  authMessage: string;
  hasPendingCloudChanges: boolean;
  isConfigured: boolean;
  isLoading: boolean;
  isSavingProfile: boolean;
  lastCloudSyncAt?: string;
  lastLocalUpdateAt?: string;
  profile: UserProfile | null;
  profileMessage: string;
  syncStatus: SyncStatus;
  userEmail?: string;
  onSaveNickname: (nickname: string) => Promise<void>;
  onSignInWithGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onSyncNow: () => Promise<void>;
}) {
  const [manualSyncMessage, setManualSyncMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const syncLabels: Record<SyncStatus, string> = {
    cloud: "Guardado en la nube",
    error: "Error al sincronizar",
    loading: "Cargando nube...",
    local: "Usando almacenamiento local",
    pending: "Cambios pendientes",
    saving: "Guardando en la nube...",
  };
  const syncLabel = syncLabels[syncStatus];
  const displayName = profile?.fullName || profile?.nickname;
  const welcomeName = profile?.nickname || profile?.fullName;
  const displayEmail = profile?.email || userEmail;
  const panelClassName = `auth-panel compact-auth ${syncStatus === "pending" || syncStatus === "error" ? "sync-warning" : ""}`;
  const handleSyncNow = async () => {
    setManualSyncMessage({ type: "info", text: "Sincronizando ahora..." });

    try {
      await onSyncNow();
      setManualSyncMessage({ type: "success", text: "Progreso sincronizado en la nube." });
      window.setTimeout(() => {
        setManualSyncMessage((current) => (current?.text === "Progreso sincronizado en la nube." ? null : current));
      }, 4200);
    } catch {
      setManualSyncMessage({ type: "error", text: "No se pudo sincronizar. Tus cambios siguen guardados en este dispositivo." });
    }
  };
  const startEditingNickname = () => {
    setNicknameDraft(profile?.nickname ?? "");
    setIsEditingNickname(true);
  };
  const saveNickname = async () => {
    await onSaveNickname(nicknameDraft);
    setIsEditingNickname(false);
  };

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
      <section className={panelClassName}>
        <div className="auth-summary-row">
          <div className="auth-summary">
            <span>{syncLabel}</span>
            <strong>
              {syncLabel} · Bienvenido{welcomeName ? `, ${welcomeName}` : ""}
            </strong>
            {hasPendingCloudChanges ? (
              <p>Tus cambios están guardados en este dispositivo, pero aún no sincronizados en la nube.</p>
            ) : null}
          </div>
          <button className="ghost-button small" type="button" onClick={() => setIsAccountOpen((current) => !current)}>
            {isAccountOpen ? "Ocultar cuenta" : "Ver cuenta"}
          </button>
        </div>

        {isAccountOpen ? (
          <div className="auth-expanded-content">
            <div>
              <strong>Sesión iniciada como {displayName || displayEmail}</strong>
              {profile?.fullName ? <p>Nombre: {profile.fullName}</p> : null}
              {displayEmail ? <p>Email: {displayEmail}</p> : null}
              {profile?.nickname ? <p>Apodo: {profile.nickname}</p> : null}
              <div className="sync-details">
                {lastCloudSyncAt ? <p>Última sincronización: {formatDisplayDate(lastCloudSyncAt)}</p> : null}
                {lastLocalUpdateAt ? <p>Última edición local: {formatDisplayDate(lastLocalUpdateAt)}</p> : null}
              </div>
            </div>
            <div className="profile-actions">
              {isEditingNickname ? (
                <>
                  <label>
                    <span>Apodo</span>
                    <input value={nicknameDraft} placeholder="Tu apodo" onChange={(event) => setNicknameDraft(event.target.value)} />
                  </label>
                  <div className="sync-actions">
                    <button className="primary-button small" disabled={isSavingProfile} onClick={() => void saveNickname()}>
                      Guardar apodo
                    </button>
                    <button className="ghost-button small" disabled={isSavingProfile} onClick={() => setIsEditingNickname(false)}>
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <button className="ghost-button small" onClick={startEditingNickname}>
                  {profile?.nickname ? "Editar apodo" : "Agregar apodo"}
                </button>
              )}
            </div>
          </div>
        ) : null}

        <div className={`sync-actions ${!isAccountOpen && !hasPendingCloudChanges ? "collapsed-secondary-actions" : ""}`}>
          <button
            className="primary-button small"
            onClick={() => void handleSyncNow()}
            disabled={!hasPendingCloudChanges || syncStatus === "saving" || syncStatus === "loading"}
          >
            Sincronizar ahora
          </button>
          {isAccountOpen ? (
            <button className="ghost-button small" onClick={onSignOut}>
              Cerrar sesión
            </button>
          ) : null}
        </div>
        {manualSyncMessage ? (
          <p className={manualSyncMessage.type === "error" ? "warning-message compact-message" : "toast-message compact-message"}>
            {manualSyncMessage.text}
          </p>
        ) : null}
        {profileMessage ? <p>{profileMessage}</p> : null}
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
      <button className="primary-button small" onClick={onSignInWithGoogle}>
        Continuar con Google
      </button>
      {authMessage ? <p>{authMessage}</p> : null}
    </section>
  );
}

function formatDisplayDate(value?: string) {
  if (!value) {
    return "No disponible";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "No disponible";
  }

  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getMigrationSummary(catalog: Sticker[], progress: Progress, trades: TradeRecord[]) {
  return {
    completion: getCompletionPercentage(catalog, progress),
    extras: getRepeatedExtras(catalog, progress),
    missing: getMissingStickers(catalog, progress).length,
    owned: getOwnedStickers(catalog, progress).length,
    repeated: getRepeatedStickers(catalog, progress).length,
    trades: trades.length,
  };
}

function getMigrationRecommendation(localOwned: number, remoteOwned: number) {
  if (remoteOwned > localOwned) {
    return "La nube parece tener más progreso que este dispositivo.";
  }

  if (localOwned > remoteOwned) {
    return "Este dispositivo parece tener más progreso que la nube.";
  }

  return "Ambos registros parecen similares.";
}

function MigrationPanel({
  catalog,
  prompt,
  onCancel,
  onCombine,
  onUploadLocal,
  onUseCloud,
}: {
  catalog: Sticker[];
  prompt: MigrationPrompt;
  onCancel: () => void;
  onCombine: () => Promise<void>;
  onUploadLocal: () => Promise<void>;
  onUseCloud: () => void;
}) {
  const [actionError, setActionError] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const localSummary = getMigrationSummary(catalog, prompt.localProgress, prompt.localTrades);
  const cloudSummary = getMigrationSummary(catalog, prompt.remoteProgress, prompt.remoteTrades);
  const hasCloudData = cloudSummary.owned > 0 || cloudSummary.repeated > 0 || cloudSummary.trades > 0;
  const recommendation = getMigrationRecommendation(localSummary.owned, cloudSummary.owned);

  const runAction = async (confirmation: string, action: () => void | Promise<void>) => {
    if (!window.confirm(confirmation)) {
      return;
    }

    setActionError("");
    setIsApplying(true);

    try {
      await action();
    } catch {
      setActionError("No se pudo completar la acción. Revisa tu conexión y vuelve a intentar.");
      setIsApplying(false);
    }
  };

  return (
    <section className="migration-panel">
      <div>
        <strong>Elegir datos del álbum</strong>
        <p>
          {prompt.type === "upload-local"
            ? "Encontramos datos locales, pero todavía no hay progreso guardado en la nube para esta cuenta."
            : "Encontramos datos locales y datos en la nube. Revisa ambos antes de decidir."}
        </p>
      </div>

      <div className="migration-comparison">
        <MigrationDataCard title="Datos locales" timestampLabel="Última modificación" timestamp={prompt.localUpdatedAt} summary={localSummary} />
        <MigrationDataCard title="Datos en la nube" timestampLabel="Última sincronización" timestamp={prompt.remoteUpdatedAt} summary={cloudSummary} />
      </div>

      <p className="migration-recommendation">{recommendation}</p>

      <div className="migration-actions">
        <button
          className="ghost-button"
          disabled={isApplying || !hasCloudData}
          onClick={() =>
            void runAction(
              "Esto reemplazará los datos locales de este dispositivo con los datos guardados en la nube. ¿Continuar?",
              onUseCloud,
            )
          }
        >
          Usar datos de la nube en este dispositivo
        </button>
        <button
          className="ghost-button"
          disabled={isApplying}
          onClick={() =>
            void runAction("Esto sobrescribirá los datos de la nube con los datos de este dispositivo. ¿Continuar?", onUploadLocal)
          }
        >
          Subir datos locales a la nube
        </button>
        <button
          className="primary-button"
          disabled={isApplying || !hasCloudData}
          onClick={() =>
            void runAction("Se combinarán ambos registros usando la mayor cantidad por estampa. ¿Continuar?", onCombine)
          }
        >
          Combinar local + nube
        </button>
        <button className="ghost-button" disabled={isApplying} onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {actionError ? <p className="warning-message compact-message">{actionError}</p> : null}
    </section>
  );
}

function MigrationDataCard({
  summary,
  timestamp,
  timestampLabel,
  title,
}: {
  summary: ReturnType<typeof getMigrationSummary>;
  timestamp?: string;
  timestampLabel: string;
  title: string;
}) {
  return (
    <article className="migration-card">
      <h3>{title}</h3>
      <dl>
        <div>
          <dt>{timestampLabel}</dt>
          <dd>{formatDisplayDate(timestamp)}</dd>
        </div>
        <div>
          <dt>Tengo</dt>
          <dd>{summary.owned}</dd>
        </div>
        <div>
          <dt>Faltantes</dt>
          <dd>{summary.missing}</dd>
        </div>
        <div>
          <dt>Repetidas</dt>
          <dd>{summary.repeated}</dd>
        </div>
        <div>
          <dt>Extras para cambiar</dt>
          <dd>{summary.extras}</dd>
        </div>
        <div>
          <dt>Intercambios</dt>
          <dd>{summary.trades}</dd>
        </div>
        <div>
          <dt>Completado</dt>
          <dd>{summary.completion}%</dd>
        </div>
      </dl>
    </article>
  );
}

function DashboardView({
  catalog,
  dashboard,
  onOpenRegistro,
  onOpenFaltantes,
  onOpenRepetidas,
  onOpenCollection,
}: {
  catalog: Sticker[];
  dashboard: {
    total: number;
    owned: number;
    missing: number;
    repeated: number;
    repeatedExtras: number;
    completion: number;
    statsByCollection: ReturnType<typeof getStatsByCollection>;
    statsByAlbumGroup: ReturnType<typeof getStatsByAlbumGroup>;
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
        <MetricCard label="Tengo" value={dashboard.owned} onClick={() => onOpenRegistro("owned")} />
        <MetricCard label="Faltantes" value={dashboard.missing} onClick={onOpenFaltantes} />
        <MetricCard label="Repetidas" value={dashboard.repeated} onClick={onOpenRepetidas} />
        <MetricCard label="Extras para cambiar" value={dashboard.repeatedExtras} onClick={onOpenRepetidas} />
        <MetricCard label="Completado" value={`${dashboard.completion}%`} />
      </div>

      <section className="panel">
        <h2>Avance por colección</h2>
        <div className="album-group-list">
          {dashboard.statsByAlbumGroup.map((group, index) => (
            <section className={`album-group-section group-accent-${index % 6}`} key={group.name}>
              <div className="album-group-heading">
                <div>
                  <h3>{group.name}</h3>
                  <span>
                    {group.owned}/{group.total} · {group.completionPercentage}% · {group.repeatedExtras} extras
                  </span>
                </div>
                <progress value={group.completionPercentage} max="100" />
              </div>
              <div className="country-progress-list">
                {group.collections.map((collection) => (
                  <button
                    className="country-progress collection-progress-button"
                    key={collection.name}
                    onClick={() => onOpenCollection(collection.name)}
                  >
                    <div>
                      <strong>{formatCollectionCodeLabel(catalog, collection.name)}</strong>
                      <small>{collection.name}</small>
                      <span>
                        {collection.owned}/{collection.total}
                      </span>
                    </div>
                    <progress value={collection.completionPercentage} max="100" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <div className="split-grid">
        <MiniRanking catalog={catalog} title="Colecciones con más faltantes" items={dashboard.mostMissing} valueKey="missing" suffix=" faltan" />
        <MiniRanking catalog={catalog} title="Más cerca de completar" items={dashboard.closest} valueKey="completionPercentage" suffix="%" />
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
  catalog,
  title,
  items,
  valueKey,
  suffix,
}: {
  catalog: Sticker[];
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
            <span>{formatCollectionCodeLabel(catalog, item.name)}</span>
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
  registrationEvents,
  onFiltersChange,
  onDeleteRegistrationEvent,
  onSetQuantity,
  onSetQuantities,
}: {
  catalog: Sticker[];
  filters: Filters;
  filteredStickers: Sticker[];
  progress: Progress;
  registrationEvents: RegistrationEvent[];
  onFiltersChange: (filters: Filters) => void;
  onDeleteRegistrationEvent: (eventId: string) => void;
  onSetQuantity: (code: string, quantity: number) => void;
  onSetQuantities: (updates: Progress, source: RegistrationEventSource, action: RegistrationEventAction, note?: string) => void;
}) {
  return (
    <section className="view-stack">
      <FilterBar catalog={catalog} filters={filters} onChange={onFiltersChange} />
      <BulkRegisterPanel catalog={catalog} stickers={filteredStickers} progress={progress} onSetQuantities={onSetQuantities} />
      <RegistrationHistoryPanel events={registrationEvents} onDeleteEvent={onDeleteRegistrationEvent} />
      <div className="section-heading">
        <h2>Registro</h2>
        <span>{filteredStickers.length} estampas</span>
      </div>
      <StickerList stickers={filteredStickers} progress={progress} onSetQuantity={onSetQuantity} />
    </section>
  );
}

function BulkRegisterPanel({
  catalog,
  stickers,
  progress,
  onSetQuantities,
}: {
  catalog: Sticker[];
  stickers: Sticker[];
  progress: Progress;
  onSetQuantities: (updates: Progress, source: RegistrationEventSource, action: RegistrationEventAction, note?: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction>("increment");
  const [fixedQuantity, setFixedQuantity] = useState(1);
  const [bulkMessage, setBulkMessage] = useState<{ type: "success" | "warning"; text: string } | null>(null);
  const parsedBulk = useMemo(() => parseBulkStickerText(bulkText, catalog), [bulkText, catalog]);
  const selectedCodeSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);
  const selectedQuantities = useMemo(() => {
    const quantities: Record<string, number> = { ...parsedBulk.quantities };

    selectedCodes.forEach((code) => {
      quantities[code] = (quantities[code] ?? 0) + 1;
    });

    return quantities;
  }, [parsedBulk.quantities, selectedCodes]);
  const selectedTotal = Object.values(selectedQuantities).reduce((total, quantity) => total + quantity, 0);

  const notifyBulk = (text: string, type: "success" | "warning" = "success") => {
    setBulkMessage({ type, text });
    window.setTimeout(() => setBulkMessage((current) => (current?.text === text ? null : current)), 3200);
  };

  const toggleCode = (code: string) => {
    setSelectedCodes((currentCodes) =>
      currentCodes.includes(code) ? currentCodes.filter((currentCode) => currentCode !== code) : [...currentCodes, code],
    );
  };

  const clearSelection = () => {
    setBulkText("");
    setSelectedCodes([]);
    setBulkMessage(null);
  };

  const applyBulkAction = () => {
    const entries = Object.entries(selectedQuantities);

    if (entries.length === 0) {
      notifyBulk("Selecciona o pega códigos para aplicar cambios.", "warning");
      return;
    }

    const updates = entries.reduce<Progress>((nextUpdates, [code, amount]) => {
      const currentQuantity = getStickerQuantity(code, progress);
      const explicitQuantity = parsedBulk.quantities[code];
      nextUpdates[code] =
        bulkAction === "increment"
          ? currentQuantity + amount
          : bulkAction === "owned"
            ? 1
            : bulkAction === "missing"
              ? 0
              : Math.max(0, Math.floor(explicitQuantity ?? fixedQuantity));

      return nextUpdates;
    }, {});

    onSetQuantities(updates, "bulk", bulkActionToRegistrationAction[bulkAction], `Registro rápido: ${selectedTotal} estampas seleccionadas.`);

    notifyBulk(`${selectedTotal} ${selectedTotal === 1 ? "estampa actualizada" : "estampas actualizadas"}.`);
  };

  return (
    <section className="panel bulk-panel">
      <button
        className="bulk-toggle"
        type="button"
        aria-expanded={isOpen}
        aria-controls="bulk-register-panel"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>
          <strong>Registro rápido</strong>
          <small>Pega rangos o selecciona varios códigos</small>
        </span>
        <span>{isOpen ? "Ocultar" : "Abrir"}</span>
      </button>

      {isOpen ? (
        <div className="bulk-content" id="bulk-register-panel">
          <div className="bulk-controls">
            <label>
              <span>Acción</span>
              <select value={bulkAction} onChange={(event) => setBulkAction(event.target.value as BulkAction)}>
                <option value="increment">Sumar +1</option>
                <option value="owned">Marcar como Tengo</option>
                <option value="missing">Marcar como Faltante</option>
                <option value="set">Fijar cantidad</option>
              </select>
            </label>
            {bulkAction === "set" ? (
              <label>
                <span>Cantidad</span>
                <input
                  min="0"
                  type="number"
                  value={fixedQuantity}
                  onChange={(event) => setFixedQuantity(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                />
              </label>
            ) : null}
          </div>

          <label className="text-import">
            <span>Pegar códigos</span>
            <textarea
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              placeholder={"MEX1, MEX2 MEX3\nARG7-ARG12\nFWC5 x2, CC4:3"}
              rows={5}
            />
          </label>

          <div className="bulk-summary">
            <strong>{selectedTotal} estampas seleccionadas</strong>
            {parsedBulk.unknownCodes.length > 0 ? <span>No encontrados: {parsedBulk.unknownCodes.join(", ")}</span> : null}
          </div>

          <div>
            <div className="section-heading compact-heading">
              <h3>Seleccionar códigos</h3>
              <span>{stickers.length} visibles por filtro</span>
            </div>
            <div className="bulk-code-grid" aria-label="Seleccionar estampas para registro rápido">
              {stickers.map((sticker) => {
                const quantity = getStickerQuantity(sticker.code, progress);
                const isSelected = selectedCodeSet.has(sticker.code);

                return (
                  <button
                    className={`bulk-code ${isSelected ? "selected" : ""}`}
                    key={sticker.code}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleCode(sticker.code)}
                  >
                    <strong>{sticker.code}</strong>
                    <span>{quantity}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bulk-actions">
            <button className="primary-button" type="button" onClick={applyBulkAction}>
              Aplicar a seleccionadas
            </button>
            <button className="ghost-button" type="button" onClick={clearSelection}>
              Limpiar selección
            </button>
          </div>
          {bulkMessage ? <p className={bulkMessage.type === "success" ? "toast-message" : "warning-message"}>{bulkMessage.text}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

const registrationSourceLabels: Record<RegistrationEventSource, string> = {
  bulk: "Registro rápido",
  collection: "Colecciones",
  import: "Importar",
  manual: "Registro",
  reset: "Reiniciar",
};

const registrationActionLabels: Record<RegistrationEventAction, string> = {
  import: "Importación",
  increment: "Sumar cantidad",
  reset: "Reinicio",
  "set-missing": "Marcar faltante",
  "set-owned": "Marcar como Tengo",
  "set-quantity": "Fijar cantidad",
};

function createRegistrationSummary(event: RegistrationEvent) {
  const changedCodes = event.items
    .slice(0, 18)
    .map((item) => `${item.code} ${item.before}->${item.after}`)
    .join(", ");
  const remaining = event.items.length > 18 ? ` y ${event.items.length - 18} más` : "";
  const note = event.note ? `\nNota: ${event.note}` : "";

  return `${registrationSourceLabels[event.source]} · ${registrationActionLabels[event.action]}\nFecha: ${formatDisplayDate(
    event.createdAt,
  )}\nCambios: ${changedCodes}${remaining}${note}`;
}

function RegistrationHistoryPanel({
  events,
  onDeleteEvent,
}: {
  events: RegistrationEvent[];
  onDeleteEvent: (eventId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedEventId, setCopiedEventId] = useState("");
  const visibleEvents = events.slice(0, 50);

  const copyEvent = async (event: RegistrationEvent) => {
    await navigator.clipboard.writeText(createRegistrationSummary(event));
    setCopiedEventId(event.id);
    window.setTimeout(() => setCopiedEventId(""), 1800);
  };

  const deleteEvent = (eventId: string) => {
    if (window.confirm("¿Eliminar este evento del historial? Esto no revierte cantidades del álbum.")) {
      onDeleteEvent(eventId);
    }
  };

  return (
    <section className="panel registration-history">
      <button
        className="bulk-toggle"
        type="button"
        aria-expanded={isOpen}
        aria-controls="registration-history-panel"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>
          <strong>Historial</strong>
          <small>Últimos cambios de registro</small>
        </span>
        <span>{isOpen ? "Ocultar" : "Abrir"}</span>
      </button>

      {isOpen ? (
        <div className="registration-history-content" id="registration-history-panel">
          <p className="history-note">Eliminar del historial no revierte las cantidades del álbum.</p>
          {events.length === 0 ? <p className="empty-state">Todavía no hay movimientos de registro.</p> : null}
          {events.length > visibleEvents.length ? <p className="history-note">Mostrando los últimos {visibleEvents.length} eventos.</p> : null}
          <div className="registration-history-list">
            {visibleEvents.map((event) => {
              const previewCodes = event.items
                .slice(0, 8)
                .map((item) => `${item.code} ${item.before}->${item.after}`)
                .join(", ");
              const remaining = event.items.length > 8 ? ` +${event.items.length - 8}` : "";

              return (
                <article className="registration-history-card" key={event.id}>
                  <div>
                    <strong>
                      {registrationSourceLabels[event.source]} · {registrationActionLabels[event.action]}
                    </strong>
                    <span>{formatDisplayDate(event.createdAt)}</span>
                  </div>
                  <p>{previewCodes || "Sin cambios"}{remaining}</p>
                  {event.note ? <p>{event.note}</p> : null}
                  <div className="quick-actions">
                    <button className="ghost-button small" onClick={() => copyEvent(event)}>
                      {copiedEventId === event.id ? "Resumen copiado" : "Copiar resumen"}
                    </button>
                    <button className="danger-button small" onClick={() => deleteEvent(event.id)}>
                      Eliminar del historial
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
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
                {formatCollectionCodeLabel(catalog, country)} — faltan {countryStickers.length}
              </h3>
              <span>{country}</span>
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

function CollapsibleSection({
  children,
  className = "",
  isOpen,
  meta,
  title,
  onToggle,
}: {
  children: ReactNode;
  className?: string;
  isOpen: boolean;
  meta?: string;
  title: string;
  onToggle: () => void;
}) {
  return (
    <section className={`panel collapsible-section ${className}`}>
      <button className="collapsible-heading" type="button" aria-expanded={isOpen} onClick={onToggle}>
        <span>
          <strong>{title}</strong>
          {meta ? <small>{meta}</small> : null}
        </span>
        <span>{isOpen ? "Ocultar" : "Mostrar"}</span>
      </button>
      {isOpen ? <div className="collapsible-content">{children}</div> : null}
    </section>
  );
}

function RepeatedView({
  catalog,
  filters,
  pendingTrades,
  progress,
  tradeHistory,
  onAddPendingTrade,
  onAddTrade,
  onDeletePendingTrade,
  onDeleteTrade,
  onFiltersChange,
  setProgress,
}: {
  catalog: Sticker[];
  filters: Filters;
  pendingTrades: PendingTradeRecord[];
  progress: Progress;
  tradeHistory: TradeRecord[];
  onAddPendingTrade: (trade: PendingTradeRecord) => void;
  onAddTrade: (trade: TradeRecord) => void;
  onDeletePendingTrade: (tradeId: string, shouldRestoreOnFailure?: boolean) => void;
  onDeleteTrade: (tradeId: string) => void;
  onFiltersChange: (filters: Filters) => void;
  setProgress: Dispatch<SetStateAction<Progress>>;
}) {
  const stickers = applyFilters(catalog, progress, { ...filters, status: "repeated" });
  const groups = groupByCountry(stickers);
  const [copyLabel, setCopyLabel] = useState("Copiar lista para intercambio");
  const [isFormOpen, setIsFormOpen] = useState(true);
  const [isRepeatedListOpen, setIsRepeatedListOpen] = useState(false);
  const [isPendingTradesOpen, setIsPendingTradesOpen] = useState(() => pendingTrades.length > 0);
  const [isTradeHistoryOpen, setIsTradeHistoryOpen] = useState(false);
  const [dateTime, setDateTime] = useState(formatDateTimeLocal(new Date()));
  const [tradedWith, setTradedWith] = useState("");
  const [notes, setNotes] = useState("");
  const [gave, setGave] = useState<TradeItem[]>([]);
  const [received, setReceived] = useState<TradeItem[]>([]);
  const [gaveSearch, setGaveSearch] = useState("");
  const [receivedSearch, setReceivedSearch] = useState("");
  const [gaveBulkText, setGaveBulkText] = useState("");
  const [receivedBulkText, setReceivedBulkText] = useState("");
  const [tradeBulkMessage, setTradeBulkMessage] = useState<{ type: "success" | "warning"; text: string } | null>(null);
  const [tradeMessage, setTradeMessage] = useState("");
  const [copiedTradeId, setCopiedTradeId] = useState("");
  const [copiedPendingTradeId, setCopiedPendingTradeId] = useState("");
  const reservedExtrasByCode = useMemo(
    () =>
      pendingTrades.reduce<Record<string, number>>((reserved, trade) => {
        trade.gave.forEach((item) => {
          reserved[item.code] = (reserved[item.code] ?? 0) + item.quantity;
        });
        return reserved;
      }, {}),
    [pendingTrades],
  );
  const getAvailableExtras = (code: string) => Math.max(0, getStickerQuantity(code, progress) - 1 - (reservedExtrasByCode[code] ?? 0));

  useEffect(() => {
    if (pendingTrades.length > 0) {
      setIsPendingTradesOpen(true);
    }
  }, [pendingTrades.length]);

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
        if (side === "gave" && existingItem.quantity >= getAvailableExtras(code)) {
          setTradeMessage(`Solo tienes ${getAvailableExtras(code)} extra(s) disponible(s) de ${code}`);
          return items;
        }

        return items.map((item) => (item.code === code ? { ...item, quantity: item.quantity + 1 } : item));
      }

      if (side === "gave" && getAvailableExtras(code) <= 0) {
        setTradeMessage(`No tienes extras disponibles de ${code}`);
        return items;
      }

      return [...items, { code, quantity: 1 }];
    });
  };

  const notifyTradeBulk = (text: string, type: "success" | "warning" = "success") => {
    setTradeBulkMessage({ type, text });
    window.setTimeout(() => setTradeBulkMessage((current) => (current?.text === text ? null : current)), 5200);
  };

  const mergeTradeItems = (items: TradeItem[], additions: TradeItem[]) => {
    const quantities = new Map(items.map((item) => [item.code, item.quantity]));

    additions.forEach((item) => {
      quantities.set(item.code, (quantities.get(item.code) ?? 0) + item.quantity);
    });

    return [...quantities.entries()]
      .map(([code, quantity]) => ({ code, quantity }))
      .sort((a, b) => a.code.localeCompare(b.code));
  };

  const addBulkTradeItems = (side: "gave" | "received") => {
    const text = side === "gave" ? gaveBulkText : receivedBulkText;
    const parsed = parseBulkStickerText(text, catalog);
    const warnings: string[] = parsed.unknownCodes.length > 0 ? [`No encontrados: ${parsed.unknownCodes.join(", ")}`] : [];
    const currentItems = side === "gave" ? gave : received;
    const additions: TradeItem[] = [];

    Object.entries(parsed.quantities).forEach(([code, quantity]) => {
      if (side === "received") {
        additions.push({ code, quantity });
        return;
      }

      const availableExtras = getAvailableExtras(code);
      const alreadySelected = currentItems.find((item) => item.code === code)?.quantity ?? 0;
      const remainingExtras = Math.max(0, availableExtras - alreadySelected);

      if (availableExtras === 0 || remainingExtras === 0) {
        warnings.push(availableExtras === 0 ? `No tienes extras disponibles de ${code}` : `Solo tienes ${availableExtras} extra(s) disponible(s) de ${code}`);
        return;
      }

      const quantityToAdd = Math.min(quantity, remainingExtras);

      if (quantityToAdd < quantity) {
        warnings.push(`Solo tienes ${availableExtras} extra(s) disponible(s) de ${code}`);
      }

      additions.push({ code, quantity: quantityToAdd });
    });

    const addedTotal = getTradeItemTotal(additions);

    if (additions.length > 0) {
      if (side === "gave") {
        setGave((items) => mergeTradeItems(items, additions));
        setGaveBulkText("");
      } else {
        setReceived((items) => mergeTradeItems(items, additions));
        setReceivedBulkText("");
      }
    }

    const targetLabel = side === "gave" ? "Doy" : "Recibo";
    const successMessage = addedTotal > 0 ? `${addedTotal} ${addedTotal === 1 ? "estampa agregada" : "estampas agregadas"} a ${targetLabel}` : "";
    const warningText = warnings.join(" · ");

    if (successMessage && warningText) {
      notifyTradeBulk(`${successMessage}. ${warningText}`, "warning");
      return;
    }

    if (successMessage) {
      notifyTradeBulk(successMessage);
      return;
    }

    notifyTradeBulk(warningText || "Pega códigos válidos para agregarlos al intercambio.", "warning");
  };

  const updateTradeItem = (side: "gave" | "received", code: string, quantity: number) => {
    const setter = side === "gave" ? setGave : setReceived;
    const requestedQuantity = Math.max(1, Math.floor(quantity) || 1);

    setter((items) =>
      items.map((item) => {
        if (item.code !== code) {
          return item;
        }

        if (side === "received") {
          return { ...item, quantity: requestedQuantity };
        }

        const cappedQuantity = Math.min(requestedQuantity, getAvailableExtras(code));

        if (cappedQuantity < requestedQuantity) {
          setTradeMessage(`Solo tienes ${getAvailableExtras(code)} extra(s) disponible(s) de ${code}`);
        }

        return { ...item, quantity: Math.max(1, cappedQuantity) };
      }),
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

    const invalidGaveItem = gave.find((item) => item.quantity > getAvailableExtras(item.code));

    if (invalidGaveItem) {
      const availableExtras = getAvailableExtras(invalidGaveItem.code);
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
    setGaveBulkText("");
    setReceivedBulkText("");
    setTradeBulkMessage(null);
    setTradeMessage("Intercambio registrado.");
    setIsFormOpen(false);
  };

  const reserveTrade = () => {
    const validationMessage = validateTrade();

    if (validationMessage) {
      setTradeMessage(validationMessage);
      return;
    }

    const pendingTrade: PendingTradeRecord = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      createdAt: dateTime || formatDateTimeLocal(new Date()),
      reservedAt: new Date().toISOString(),
      tradedWith: tradedWith.trim() || undefined,
      notes: notes.trim() || undefined,
      gave,
      received,
    };

    onAddPendingTrade(pendingTrade);
    setDateTime(formatDateTimeLocal(new Date()));
    setTradedWith("");
    setNotes("");
    setGave([]);
    setReceived([]);
    setGaveSearch("");
    setReceivedSearch("");
    setGaveBulkText("");
    setReceivedBulkText("");
    setTradeBulkMessage(null);
    setTradeMessage("Intercambio apartado. Las cantidades se actualizarán cuando lo confirmes.");
    setIsFormOpen(false);
  };

  const validatePendingTrade = (trade: PendingTradeRecord) => {
    const invalidGaveItem = trade.gave.find((item) => item.quantity > Math.max(0, getStickerQuantity(item.code, progress) - 1));

    if (invalidGaveItem) {
      const availableExtras = Math.max(0, getStickerQuantity(invalidGaveItem.code, progress) - 1);
      return `Solo tienes ${availableExtras} extra(s) disponible(s) de ${invalidGaveItem.code}`;
    }

    return "";
  };

  const confirmPendingTrade = (trade: PendingTradeRecord) => {
    const validationMessage = validatePendingTrade(trade);

    if (validationMessage) {
      setTradeMessage(validationMessage);
      return;
    }

    const confirmedTrade: TradeRecord = {
      id: trade.id,
      createdAt: trade.createdAt,
      tradedWith: trade.tradedWith,
      notes: trade.notes,
      gave: trade.gave,
      received: trade.received,
    };

    setProgress((currentProgress) => applyTradeToProgress(currentProgress, confirmedTrade));
    onAddTrade(confirmedTrade);
    onDeletePendingTrade(trade.id, false);
    setTradeMessage("Intercambio confirmado. Ahora sí se actualizaron las cantidades del álbum.");
  };

  const copyPendingTradeRecord = async (trade: PendingTradeRecord) => {
    await navigator.clipboard.writeText(createTradeSummary(trade));
    setCopiedPendingTradeId(trade.id);
    window.setTimeout(() => setCopiedPendingTradeId(""), 1800);
  };

  const deletePendingTradeRecord = (tradeId: string) => {
    if (window.confirm("¿Cancelar este intercambio apartado? No se modificarán cantidades del álbum.")) {
      onDeletePendingTrade(tradeId);
    }
  };

  const cancelTrade = () => {
    setDateTime(formatDateTimeLocal(new Date()));
    setTradedWith("");
    setNotes("");
    setGave([]);
    setReceived([]);
    setGaveSearch("");
    setReceivedSearch("");
    setGaveBulkText("");
    setReceivedBulkText("");
    setTradeBulkMessage(null);
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
  const repeatedExtras = getRepeatedExtras(stickers, progress);

  return (
    <section className="view-stack">
      <FilterBar catalog={catalog} filters={{ ...filters, status: "repeated" }} onChange={onFiltersChange} showStatus={false} />
      <div className="trade-action-row">
        <button className="ghost-button wide-button" onClick={copyTradeList}>
          {copyLabel}
        </button>
      </div>

      <CollapsibleSection
        className="trade-form"
        title="Registrar intercambio"
        meta={`Doy: ${gaveTotal} estampas · Recibo: ${receivedTotal} estampas`}
        isOpen={isFormOpen}
        onToggle={() => setIsFormOpen((current) => !current)}
      >
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

          <div className="trade-bulk-grid">
            <TradeBulkInput
              buttonLabel="Agregar a Doy"
              label="Pegar códigos que doy"
              placeholder="Ej. MEX3, MEX4, ARG1-ARG3, BRA7 x2"
              summary="Doy en bulk"
              value={gaveBulkText}
              onAdd={() => addBulkTradeItems("gave")}
              onChange={setGaveBulkText}
            />
            <TradeBulkInput
              buttonLabel="Agregar a Recibo"
              label="Pegar códigos que recibo"
              placeholder="Ej. FWC5, BRA7, CC1, MEX10-MEX12"
              summary="Recibo en bulk"
              value={receivedBulkText}
              onAdd={() => addBulkTradeItems("received")}
              onChange={setReceivedBulkText}
            />
          </div>
          {tradeBulkMessage ? (
            <p className={tradeBulkMessage.type === "success" ? "toast-message compact-message" : "warning-message compact-message"}>
              {tradeBulkMessage.text}
            </p>
          ) : null}

          <div className="trade-builder-grid">
            <TradeBuilder
              title="Doy"
              mode="gave"
              catalog={catalog}
              getAvailableExtras={getAvailableExtras}
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
              getAvailableExtras={getAvailableExtras}
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
          <button className="ghost-button wide-button" onClick={reserveTrade}>
            Apartar intercambio
          </button>
          <button className="ghost-button wide-button" onClick={cancelTrade}>
            Cancelar intercambio
          </button>
      </CollapsibleSection>
      {tradeMessage ? <p className={tradeMessage === "Intercambio registrado." ? "toast-message" : "warning-message"}>{tradeMessage}</p> : null}

      <CollapsibleSection
        title="Repetidas"
        meta={`${stickers.length} estampas · Extras: ${repeatedExtras}`}
        isOpen={isRepeatedListOpen}
        onToggle={() => setIsRepeatedListOpen((current) => !current)}
      >
        <div className="grouped-list">
          {[...groups.entries()].map(([country, countryStickers]) => (
            <article className="panel" key={country}>
              <h3>{formatCollectionCodeLabel(catalog, country)}</h3>
              <p className="history-note">{country}</p>
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
      </CollapsibleSection>

      <CollapsibleSection
        className="trade-history pending-trade-panel"
        title="Futuros intercambios / Apartados"
        meta={`Apartados: ${pendingTrades.length}`}
        isOpen={isPendingTradesOpen}
        onToggle={() => setIsPendingTradesOpen((current) => !current)}
      >
        <p className="history-note">Estas estampas están apartadas. El álbum cambia hasta que confirmes el intercambio.</p>
        {pendingTrades.length === 0 ? <p className="empty-state">No tienes intercambios apartados.</p> : null}
        <div className="trade-history-list">
          {pendingTrades.map((trade) => {
            const uneven = getTradeItemTotal(trade.gave) !== getTradeItemTotal(trade.received);

            return (
              <article className="trade-history-card pending-trade-card" key={trade.id}>
                <div className="section-heading flush">
                  <h3>{trade.tradedWith ? `Apartado con ${trade.tradedWith}` : "Intercambio apartado"}</h3>
                  {uneven ? <span>Intercambio no parejo</span> : null}
                </div>
                <p>Fecha: {trade.createdAt.replace("T", " ")}</p>
                <p>Apartado: {formatDisplayDate(trade.reservedAt)}</p>
                <p>
                  <strong>Doy apartado:</strong> {formatTradeItems(trade.gave)}
                </p>
                <p>
                  <strong>Recibiré:</strong> {formatTradeItems(trade.received)}
                </p>
                {trade.notes ? <p>Notas: {trade.notes}</p> : null}
                <div className="quick-actions">
                  <button className="primary-button small" onClick={() => confirmPendingTrade(trade)}>
                    Confirmar intercambio
                  </button>
                  <button className="ghost-button small" onClick={() => copyPendingTradeRecord(trade)}>
                    {copiedPendingTradeId === trade.id ? "Resumen copiado" : "Copiar resumen"}
                  </button>
                  <button className="danger-button small" onClick={() => deletePendingTradeRecord(trade.id)}>
                    Cancelar apartado
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        className="trade-history"
        title="Historial de intercambios"
        meta={`Historial: ${tradeHistory.length}`}
        isOpen={isTradeHistoryOpen}
        onToggle={() => setIsTradeHistoryOpen((current) => !current)}
      >
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
      </CollapsibleSection>
    </section>
  );
}

function TradeBulkInput({
  buttonLabel,
  label,
  placeholder,
  summary,
  value,
  onAdd,
  onChange,
}: {
  buttonLabel: string;
  label: string;
  placeholder: string;
  summary: string;
  value: string;
  onAdd: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <details className="trade-bulk-panel">
      <summary>{summary}</summary>
      <div className="trade-bulk-content">
        <p>Puedes pegar códigos separados por comas, espacios o saltos de línea. También puedes usar rangos como MEX1-MEX5.</p>
        <label className="text-import">
          <span>{label}</span>
          <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} />
        </label>
        <button className="ghost-button" type="button" onClick={onAdd}>
          {buttonLabel}
        </button>
      </div>
    </details>
  );
}

function TradeBuilder({
  title,
  mode,
  catalog,
  getAvailableExtras,
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
  getAvailableExtras: (code: string) => number;
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
      if (mode === "gave" && getAvailableExtras(sticker.code) <= 0) {
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
        return getAvailableExtras(b.code) - getAvailableExtras(a.code) || a.code.localeCompare(b.code);
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
                <span>{sticker ? formatCollectionCodeLabel(catalog, getCollectionName(sticker)) : ""}</span>
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
          const extras = getAvailableExtras(sticker.code);

          return (
            <button
              className="trade-candidate"
              key={sticker.code}
              onClick={() => onAdd(sticker.code)}
              disabled={selectedCodes.has(sticker.code) && mode === "gave" && items.find((item) => item.code === sticker.code)?.quantity === extras}
            >
              <strong>{sticker.code}</strong>
              <span>{formatCollectionCodeLabel(catalog, getCollectionName(sticker))}</span>
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
  const stickers = sortStickersByAlbumOrder(
    catalog.filter((sticker) => getCollectionName(sticker) === collection),
    catalog,
  );
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
                {formatCollectionCodeLabel(catalog, item.name)} — {item.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel">
        <div className="section-heading flush">
          <h2>{formatCollectionCodeLabel(catalog, collection)}</h2>
          <span>{stickers.length} estampas</span>
        </div>
        <p className="history-note">{collection}</p>
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
  onReplaceProgress,
  progress,
}: {
  catalog: Sticker[];
  onReplaceProgress: (nextProgress: Progress, source: RegistrationEventSource, action: RegistrationEventAction, note?: string) => void;
  progress: Progress;
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
      onReplaceProgress(importProgressFromJson(jsonText, catalog), "import", "import", "Importación JSON");
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
    downloadTextFile(createTimestampedFilename(filename), content, type);
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
      onReplaceProgress({}, "reset", "reset", "Reinicio manual del progreso");
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
          <li>0 = Faltante, 1 = Tengo, 2+ = Repetida.</li>
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
              "album-progress.json",
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
            downloadFile("faltantes.csv", exportMissingToCsv(catalog, progress), "text/csv", "download-missing")
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
            downloadFile("repetidas.csv", exportRepeatedToCsv(catalog, progress), "text/csv", "download-repeated")
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
