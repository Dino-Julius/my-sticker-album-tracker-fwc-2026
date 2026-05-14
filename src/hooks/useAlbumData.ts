import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PendingTradeRecord,
  Progress,
  RegistrationEvent,
  SyncIssue,
  SyncIssueArea,
  SyncIssueOperation,
  TradeRecord,
} from "../types";
import { loadRemoteProgress, saveRemoteProgress } from "../lib/remoteProgress";
import {
  deleteRemotePendingTrade,
  loadRemotePendingTrades,
  upsertRemotePendingTrade,
} from "../lib/remotePendingTrades";
import {
  deleteRemoteRegistrationEvent,
  insertRemoteRegistrationEvent,
  loadRemoteRegistrationEvents,
} from "../lib/remoteRegistrationEvents";
import { deleteRemoteTrade, insertRemoteTrade, loadRemoteTrades } from "../lib/remoteTrades";
import { STORAGE_KEY, TRADE_HISTORY_STORAGE_KEY } from "../lib/album";

const CLOUD_SYNC_DEBOUNCE_MS = 7000;
const UNSYNCED_CHANGES_MESSAGE = "Tienes cambios guardados en este dispositivo, pero aún no sincronizados en la nube.";
const LOCAL_META_STORAGE_KEY = "my-sticker-album-tracker-fwc-2026-local-meta";
export const REGISTRATION_EVENTS_STORAGE_KEY = "my-sticker-album-tracker-fwc-2026-registration-events";
export const PENDING_TRADES_STORAGE_KEY = "my-sticker-album-tracker-fwc-2026-pending-trades";
const PENDING_TRADES_SYNCED_IDS_STORAGE_KEY = "my-sticker-album-tracker-fwc-2026-pending-trades-synced-ids";

export type SyncStatus = "local" | "loading" | "pending" | "saving" | "cloud" | "error";
export type LocalMeta = {
  updatedAt?: string;
};
export type MigrationPrompt =
  | {
      type: "upload-local";
      localProgress: Progress;
      localTrades: TradeRecord[];
      localUpdatedAt?: string;
      remoteProgress: Progress;
      remoteTrades: TradeRecord[];
      remoteUpdatedAt?: string;
    }
  | {
      type: "resolve-conflict";
      localProgress: Progress;
      localTrades: TradeRecord[];
      localUpdatedAt?: string;
      remoteProgress: Progress;
      remoteTrades: TradeRecord[];
      remoteUpdatedAt?: string;
    };

const SYNC_ISSUE_MESSAGES: Record<Exclude<SyncIssueArea, "profile">, Record<SyncIssueOperation, string>> = {
  progress: {
    delete: "No se pudo eliminar progreso remoto.",
    load: "No se pudo cargar el progreso de la nube.",
    save: "No se pudo guardar el progreso en la nube.",
  },
  trades: {
    delete: "No se pudo eliminar el intercambio remoto.",
    load: "No se pudo cargar el historial de intercambios.",
    save: "No se pudo sincronizar historial.",
  },
  "registration-events": {
    delete: "No se pudo eliminar el evento del historial.",
    load: "No se pudo cargar el historial de registro.",
    save: "No se pudo sincronizar historial de registro.",
  },
  "pending-trades": {
    delete: "No se pudo eliminar el apartado en la nube.",
    load: "No se pudo cargar apartados.",
    save: "No se pudo guardar apartados.",
  },
};

function createSyncIssue(area: Exclude<SyncIssueArea, "profile">, operation: SyncIssueOperation): SyncIssue {
  return {
    area,
    createdAt: new Date().toISOString(),
    id: `${area}-${operation}`,
    message: SYNC_ISSUE_MESSAGES[area][operation],
    operation,
  };
}

async function loadRemoteWithIssue<T>(
  loader: () => Promise<T>,
  area: Exclude<SyncIssueArea, "profile">,
  fallback: T,
): Promise<{ issue?: SyncIssue; value: T }> {
  try {
    return { value: await loader() };
  } catch {
    return { issue: createSyncIssue(area, "load"), value: fallback };
  }
}

function readLocalProgress(): Progress {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored) as Progress;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readLocalTrades(): TradeRecord[] {
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
}

function readLocalRegistrationEvents(): RegistrationEvent[] {
  const stored = localStorage.getItem(REGISTRATION_EVENTS_STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as RegistrationEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLocalPendingTrades(): PendingTradeRecord[] {
  const stored = localStorage.getItem(PENDING_TRADES_STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as PendingTradeRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readSyncedPendingTradeIds() {
  const stored = localStorage.getItem(PENDING_TRADES_SYNCED_IDS_STORAGE_KEY);

  if (!stored) {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(stored) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
}

function writeSyncedPendingTradeIds(ids: Iterable<string>) {
  localStorage.setItem(PENDING_TRADES_SYNCED_IDS_STORAGE_KEY, JSON.stringify([...new Set(ids)].sort()));
}

function addSyncedPendingTradeId(id: string) {
  const ids = readSyncedPendingTradeIds();
  ids.add(id);
  writeSyncedPendingTradeIds(ids);
}

function readLocalMeta(): LocalMeta {
  const stored = localStorage.getItem(LOCAL_META_STORAGE_KEY);

  if (!stored) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored) as LocalMeta;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalMeta(updatedAt = new Date().toISOString()) {
  localStorage.setItem(LOCAL_META_STORAGE_KEY, JSON.stringify({ updatedAt }));
  return updatedAt;
}

function hasProgressData(progress: Progress) {
  return Object.values(progress).some((quantity) => quantity > 0);
}

function hasLocalData(progress: Progress, trades: TradeRecord[]) {
  return hasProgressData(progress) || trades.length > 0;
}

function mergeProgress(localProgress: Progress, remoteProgress: Progress): Progress {
  const codes = new Set([...Object.keys(localProgress), ...Object.keys(remoteProgress)]);

  return [...codes].reduce<Progress>((merged, code) => {
    merged[code] = Math.max(localProgress[code] ?? 0, remoteProgress[code] ?? 0);
    return merged;
  }, {});
}

function mergeTrades(localTrades: TradeRecord[], remoteTrades: TradeRecord[]) {
  const trades = new Map<string, TradeRecord>();

  [...remoteTrades, ...localTrades].forEach((trade) => {
    trades.set(trade.id, trade);
  });

  return [...trades.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function mergePendingTrades(
  localPendingTrades: PendingTradeRecord[],
  remotePendingTrades: PendingTradeRecord[],
  confirmedTrades: TradeRecord[],
) {
  const confirmedTradeIds = new Set(confirmedTrades.map((trade) => trade.id));
  const pendingTrades = new Map<string, PendingTradeRecord>();

  [...remotePendingTrades, ...localPendingTrades].forEach((trade) => {
    if (!confirmedTradeIds.has(trade.id)) {
      pendingTrades.set(trade.id, trade);
    }
  });

  return [...pendingTrades.values()].sort((a, b) => b.reservedAt.localeCompare(a.reservedAt));
}

function mergeRegistrationEvents(localEvents: RegistrationEvent[], remoteEvents: RegistrationEvent[]) {
  const events = new Map<string, RegistrationEvent>();

  [...remoteEvents, ...localEvents].forEach((event) => {
    events.set(event.id, event);
  });

  return [...events.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function serializeProgressSnapshot(progress: Progress) {
  return JSON.stringify(
    Object.keys(progress)
      .sort()
      .reduce<Progress>((snapshot, code) => {
        const quantity = Number(progress[code]);
        snapshot[code] = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 0;
        return snapshot;
      }, {}),
  );
}

function serializeTradeSnapshot(trades: TradeRecord[]) {
  return JSON.stringify(
    [...trades]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((trade) => ({
        ...trade,
        gave: [...trade.gave].sort((a, b) => a.code.localeCompare(b.code)),
        received: [...trade.received].sort((a, b) => a.code.localeCompare(b.code)),
      })),
  );
}

function isSameAlbumData(
  localProgress: Progress,
  localTrades: TradeRecord[],
  remoteProgress: Progress,
  remoteTrades: TradeRecord[],
) {
  return (
    serializeProgressSnapshot(localProgress) === serializeProgressSnapshot(remoteProgress) &&
    serializeTradeSnapshot(localTrades) === serializeTradeSnapshot(remoteTrades)
  );
}

export function useAlbumData({ isCloudEnabled, userId }: { isCloudEnabled: boolean; userId?: string }) {
  const [progress, setProgress] = useState<Progress>(() => readLocalProgress());
  const [registrationEvents, setRegistrationEvents] = useState<RegistrationEvent[]>(() => readLocalRegistrationEvents());
  const [pendingTrades, setPendingTrades] = useState<PendingTradeRecord[]>(() => readLocalPendingTrades());
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>(() => readLocalTrades());
  const [migrationPrompt, setMigrationPrompt] = useState<MigrationPrompt | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [syncIssues, setSyncIssues] = useState<SyncIssue[]>([]);
  const [syncRetryToken, setSyncRetryToken] = useState(0);
  const [hasPendingCloudChanges, setHasPendingCloudChanges] = useState(false);
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<string | undefined>(undefined);
  const [lastLocalUpdateAt, setLastLocalUpdateAt] = useState<string | undefined>(() => readLocalMeta().updatedAt);
  const hasLoadedRemote = useRef(false);
  const lastSavedProgress = useRef("");
  const latestProgress = useRef(progress);
  const latestSerializedProgress = useRef(serializeProgressSnapshot(progress));
  const saveTimerId = useRef<number | null>(null);
  const isSavingProgress = useRef(false);
  const saveAgainAfterCurrent = useRef(false);
  const hasPendingCloudChangesRef = useRef(false);
  const hasInitializedProgressPersistence = useRef(false);
  const hasInitializedPendingTradePersistence = useRef(false);
  const hasInitializedRegistrationEventPersistence = useRef(false);
  const hasInitializedTradePersistence = useRef(false);
  const flushPendingProgressRef = useRef<() => Promise<void>>(async () => {});

  latestProgress.current = progress;
  latestSerializedProgress.current = serializeProgressSnapshot(progress);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerId.current) {
      window.clearTimeout(saveTimerId.current);
      saveTimerId.current = null;
    }
  }, []);

  const updatePendingCloudChanges = useCallback((isPending: boolean) => {
    hasPendingCloudChangesRef.current = isPending;
    setHasPendingCloudChanges(isPending);
  }, []);

  const addSyncIssue = useCallback((issue: SyncIssue) => {
    setSyncIssues((currentIssues) => [
      issue,
      ...currentIssues.filter((currentIssue) => currentIssue.id !== issue.id),
    ]);
  }, []);

  const clearSyncIssue = useCallback((area: SyncIssueArea, operation?: SyncIssueOperation) => {
    setSyncIssues((currentIssues) =>
      currentIssues.filter((issue) => issue.area !== area || (operation ? issue.operation !== operation : false)),
    );
  }, []);

  const schedulePendingSave = useCallback(
    (delay = CLOUD_SYNC_DEBOUNCE_MS) => {
      clearSaveTimer();
      saveTimerId.current = window.setTimeout(() => {
        saveTimerId.current = null;
        void flushPendingProgressRef.current();
      }, delay);
    },
    [clearSaveTimer],
  );

  const flushPendingProgress = useCallback(
    async (progressOverride?: Progress, shouldThrow = false) => {
      if (!isCloudEnabled || !userId || !hasLoadedRemote.current) {
        return;
      }

      if (isSavingProgress.current) {
        saveAgainAfterCurrent.current = true;
        return;
      }

      const progressToSave = progressOverride ?? latestProgress.current;
      const serializedProgress = serializeProgressSnapshot(progressToSave);

      if (serializedProgress === lastSavedProgress.current && !hasPendingCloudChangesRef.current) {
        updatePendingCloudChanges(false);
        setSyncStatus("cloud");
        return;
      }

      clearSaveTimer();
      isSavingProgress.current = true;
      setSyncStatus("saving");

      try {
        const updatedAt = await saveRemoteProgress(userId, progressToSave);
        clearSyncIssue("progress", "save");
        lastSavedProgress.current = serializedProgress;
        setLastCloudSyncAt(updatedAt);

        if (latestSerializedProgress.current === serializedProgress) {
          saveAgainAfterCurrent.current = false;
          updatePendingCloudChanges(false);
          setSyncStatus("cloud");
        } else {
          updatePendingCloudChanges(true);
          setSyncStatus("pending");
          saveAgainAfterCurrent.current = true;
        }
      } catch (error) {
        saveAgainAfterCurrent.current = false;
        updatePendingCloudChanges(true);
        addSyncIssue(createSyncIssue("progress", "save"));
        setSyncStatus("error");

        if (shouldThrow) {
          throw error;
        }
      } finally {
        isSavingProgress.current = false;

        if (saveAgainAfterCurrent.current && latestSerializedProgress.current !== lastSavedProgress.current) {
          saveAgainAfterCurrent.current = false;
          schedulePendingSave(0);
        }
      }
    },
    [addSyncIssue, clearSaveTimer, clearSyncIssue, isCloudEnabled, schedulePendingSave, updatePendingCloudChanges, userId],
  );

  useEffect(() => {
    flushPendingProgressRef.current = flushPendingProgress;
  }, [flushPendingProgress]);

  useEffect(() => () => clearSaveTimer(), [clearSaveTimer]);

  useEffect(() => {
    if (!hasInitializedProgressPersistence.current) {
      hasInitializedProgressPersistence.current = true;
      return;
    }

    localStorage.setItem(STORAGE_KEY, latestSerializedProgress.current);
    setLastLocalUpdateAt(writeLocalMeta());
  }, [progress]);

  useEffect(() => {
    if (!hasInitializedTradePersistence.current) {
      hasInitializedTradePersistence.current = true;
      return;
    }

    localStorage.setItem(TRADE_HISTORY_STORAGE_KEY, JSON.stringify(tradeHistory));
    setLastLocalUpdateAt(writeLocalMeta());
  }, [tradeHistory]);

  useEffect(() => {
    if (!hasInitializedRegistrationEventPersistence.current) {
      hasInitializedRegistrationEventPersistence.current = true;
      return;
    }

    localStorage.setItem(REGISTRATION_EVENTS_STORAGE_KEY, JSON.stringify(registrationEvents));
    setLastLocalUpdateAt(writeLocalMeta());
  }, [registrationEvents]);

  useEffect(() => {
    if (!hasInitializedPendingTradePersistence.current) {
      hasInitializedPendingTradePersistence.current = true;
      return;
    }

    localStorage.setItem(PENDING_TRADES_STORAGE_KEY, JSON.stringify(pendingTrades));
    setLastLocalUpdateAt(writeLocalMeta());
  }, [pendingTrades]);

  useEffect(() => {
    clearSaveTimer();
    hasLoadedRemote.current = false;
    lastSavedProgress.current = "";
    updatePendingCloudChanges(false);
    setMigrationPrompt(null);

    if (!isCloudEnabled || !userId) {
      setSyncStatus("local");
      return;
    }

    let isActive = true;
    setSyncStatus("loading");

    const localProgress = readLocalProgress();
    const localPendingTrades = readLocalPendingTrades();
    const localRegistrationEvents = readLocalRegistrationEvents();
    const localTrades = readLocalTrades();
    const localMeta = readLocalMeta();
    const syncedPendingTradeIds = readSyncedPendingTradeIds();

    Promise.all([
      loadRemoteWithIssue(() => loadRemoteProgress(userId), "progress", null),
      loadRemoteWithIssue(() => loadRemotePendingTrades(userId), "pending-trades", []),
      loadRemoteWithIssue(() => loadRemoteTrades(userId), "trades", []),
      loadRemoteWithIssue(() => loadRemoteRegistrationEvents(userId), "registration-events", []),
    ])
      .then(([remoteProgressResult, remotePendingTradesResult, remoteTradesResult, remoteRegistrationEventsResult]) => {
        if (!isActive) {
          return;
        }

        const loadIssues = [
          remoteProgressResult.issue,
          remotePendingTradesResult.issue,
          remoteTradesResult.issue,
          remoteRegistrationEventsResult.issue,
        ].filter(Boolean) as SyncIssue[];
        setSyncIssues((currentIssues) => [
          ...loadIssues,
          ...currentIssues.filter((issue) => issue.operation !== "load" && !loadIssues.some((loadIssue) => loadIssue.id === issue.id)),
        ]);

        const remoteProgressSnapshot = remoteProgressResult.value;
        const remotePendingTrades = remotePendingTradesResult.value;
        const remoteTrades = remoteTradesResult.value;
        const remoteRegistrationEvents = remoteRegistrationEventsResult.value;
        const confirmedTrades = mergeTrades(localTrades, remoteTrades);
        const confirmedTradeIds = new Set(confirmedTrades.map((trade) => trade.id));
        const remotePendingTradeIds = new Set(remotePendingTrades.map((trade) => trade.id));
        const localPendingTradesToMerge = localPendingTrades.filter(
          (trade) => remotePendingTradeIds.has(trade.id) || !syncedPendingTradeIds.has(trade.id),
        );
        const mergedPendingTrades = mergePendingTrades(localPendingTradesToMerge, remotePendingTrades, confirmedTrades);
        const mergedRegistrationEvents = mergeRegistrationEvents(localRegistrationEvents, remoteRegistrationEvents);
        const normalizedRemoteProgress = remoteProgressSnapshot?.progress ?? {};
        const remoteUpdatedAt = remoteProgressSnapshot?.updatedAt;
        setLastCloudSyncAt(remoteUpdatedAt);
        setLastLocalUpdateAt(localMeta.updatedAt);
        const localHasData = hasLocalData(localProgress, localTrades);
        const remoteHasData = hasLocalData(normalizedRemoteProgress, remoteTrades);

        setRegistrationEvents(mergedRegistrationEvents);
        setPendingTrades(mergedPendingTrades);
        localStorage.setItem(REGISTRATION_EVENTS_STORAGE_KEY, JSON.stringify(mergedRegistrationEvents));
        localStorage.setItem(PENDING_TRADES_STORAGE_KEY, JSON.stringify(mergedPendingTrades));

        writeSyncedPendingTradeIds([...syncedPendingTradeIds, ...remotePendingTradeIds]);

        const unsyncedPendingTrades = mergedPendingTrades.filter(
          (trade) => !remotePendingTradeIds.has(trade.id) && !syncedPendingTradeIds.has(trade.id),
        );
        const staleRemotePendingTrades = remotePendingTrades.filter((trade) => confirmedTradeIds.has(trade.id));

        if (unsyncedPendingTrades.length > 0) {
          void Promise.all(unsyncedPendingTrades.map((trade) => upsertRemotePendingTrade(userId, trade)))
            .then(() => {
              if (isActive) {
                writeSyncedPendingTradeIds([...readSyncedPendingTradeIds(), ...unsyncedPendingTrades.map((trade) => trade.id)]);
              }
            })
            .catch(() => {
              if (isActive) {
                addSyncIssue(createSyncIssue("pending-trades", "save"));
                setSyncStatus("error");
              }
            });
        }

        if (staleRemotePendingTrades.length > 0) {
          void Promise.all(staleRemotePendingTrades.map((trade) => deleteRemotePendingTrade(userId, trade.id))).catch(() => {
            if (isActive) {
              addSyncIssue(createSyncIssue("pending-trades", "delete"));
              setSyncStatus("error");
            }
          });
        }

        const remoteRegistrationEventIds = new Set(remoteRegistrationEvents.map((event) => event.id));
        const unsyncedRegistrationEvents = mergedRegistrationEvents.filter((event) => !remoteRegistrationEventIds.has(event.id));
        if (unsyncedRegistrationEvents.length > 0) {
          void Promise.all(unsyncedRegistrationEvents.map((event) => insertRemoteRegistrationEvent(userId, event))).catch(() => {
            if (isActive) {
              addSyncIssue(createSyncIssue("registration-events", "save"));
              setSyncStatus("error");
            }
          });
        }

        if (localHasData && !remoteHasData) {
          setMigrationPrompt({
            type: "upload-local",
            localProgress,
            localTrades,
            localUpdatedAt: localMeta.updatedAt,
            remoteProgress: normalizedRemoteProgress,
            remoteTrades,
            remoteUpdatedAt,
          });
          lastSavedProgress.current = serializeProgressSnapshot(localProgress);
          updatePendingCloudChanges(false);
        } else if (localHasData && remoteHasData) {
          if (isSameAlbumData(localProgress, localTrades, normalizedRemoteProgress, remoteTrades)) {
            setProgress(normalizedRemoteProgress);
            setTradeHistory(remoteTrades);
            lastSavedProgress.current = serializeProgressSnapshot(normalizedRemoteProgress);
          } else {
            setMigrationPrompt({
              type: "resolve-conflict",
              localProgress,
              localTrades,
              localUpdatedAt: localMeta.updatedAt,
              remoteProgress: normalizedRemoteProgress,
              remoteTrades,
              remoteUpdatedAt,
            });
            lastSavedProgress.current = serializeProgressSnapshot(localProgress);
          }
          updatePendingCloudChanges(false);
        } else if (remoteHasData) {
          setProgress(normalizedRemoteProgress);
          setTradeHistory(remoteTrades);
          lastSavedProgress.current = serializeProgressSnapshot(normalizedRemoteProgress);
          updatePendingCloudChanges(false);
        } else {
          lastSavedProgress.current = serializeProgressSnapshot(localProgress);
          updatePendingCloudChanges(false);
        }

        hasLoadedRemote.current = true;
        setSyncStatus(loadIssues.length > 0 ? "error" : "cloud");
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        hasLoadedRemote.current = true;
        addSyncIssue(createSyncIssue("progress", "load"));
        setSyncStatus("error");
      });

    return () => {
      isActive = false;
    };
  }, [addSyncIssue, clearSaveTimer, isCloudEnabled, syncRetryToken, updatePendingCloudChanges, userId]);

  useEffect(() => {
    if (!isCloudEnabled || !userId || !hasLoadedRemote.current || migrationPrompt) {
      return;
    }

    const serializedProgress = latestSerializedProgress.current;

    if (serializedProgress === lastSavedProgress.current) {
      clearSaveTimer();
      updatePendingCloudChanges(false);
      if (!isSavingProgress.current) {
        setSyncStatus("cloud");
      }
      return;
    }

    updatePendingCloudChanges(true);

    if (!isSavingProgress.current) {
      setSyncStatus("pending");
      schedulePendingSave();
    } else {
      saveAgainAfterCurrent.current = true;
    }
  }, [clearSaveTimer, isCloudEnabled, migrationPrompt, progress, schedulePendingSave, updatePendingCloudChanges, userId]);

  useEffect(() => {
    if (!isCloudEnabled || !userId || !hasPendingCloudChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      void flushPendingProgressRef.current();
      event.preventDefault();
      event.returnValue = UNSYNCED_CHANGES_MESSAGE;
      return UNSYNCED_CHANGES_MESSAGE;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasPendingCloudChanges, isCloudEnabled, userId]);

  useEffect(() => {
    if (!isCloudEnabled || !userId) {
      return;
    }

    const flushIfPending = () => {
      if (hasPendingCloudChangesRef.current) {
        void flushPendingProgressRef.current();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushIfPending();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flushIfPending);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flushIfPending);
    };
  }, [isCloudEnabled, userId]);

  const saveProgressAndTradesRemote = async (nextProgress: Progress, nextTrades: TradeRecord[]) => {
    if (!isCloudEnabled || !userId) {
      return;
    }

    clearSaveTimer();
    updatePendingCloudChanges(true);
    setSyncStatus("saving");
    let progressSaved = false;
    try {
      const updatedAt = await saveRemoteProgress(userId, nextProgress);
      progressSaved = true;
      clearSyncIssue("progress", "save");
      await Promise.all(nextTrades.map((trade) => insertRemoteTrade(userId, trade)));
      clearSyncIssue("trades", "save");
      lastSavedProgress.current = serializeProgressSnapshot(nextProgress);
      setLastCloudSyncAt(updatedAt);
      setLastLocalUpdateAt(writeLocalMeta(updatedAt));
      updatePendingCloudChanges(false);
      setSyncStatus("cloud");
    } catch (error) {
      addSyncIssue(createSyncIssue(progressSaved ? "trades" : "progress", "save"));
      updatePendingCloudChanges(serializeProgressSnapshot(nextProgress) !== lastSavedProgress.current);
      setSyncStatus("error");
      throw error;
    }
  };

  const useCloudData = () => {
    if (!migrationPrompt) {
      return;
    }

    setProgress(migrationPrompt.remoteProgress);
    setTradeHistory(migrationPrompt.remoteTrades);
    localStorage.setItem(STORAGE_KEY, serializeProgressSnapshot(migrationPrompt.remoteProgress));
    localStorage.setItem(TRADE_HISTORY_STORAGE_KEY, JSON.stringify(migrationPrompt.remoteTrades));
    setLastCloudSyncAt(migrationPrompt.remoteUpdatedAt);
    setLastLocalUpdateAt(writeLocalMeta(migrationPrompt.remoteUpdatedAt));
    lastSavedProgress.current = serializeProgressSnapshot(migrationPrompt.remoteProgress);
    clearSaveTimer();
    updatePendingCloudChanges(false);
    setMigrationPrompt(null);
    setSyncStatus("cloud");
  };

  const uploadLocalData = async () => {
    if (!migrationPrompt) {
      return;
    }

    await saveProgressAndTradesRemote(migrationPrompt.localProgress, migrationPrompt.localTrades);
    setProgress(migrationPrompt.localProgress);
    setTradeHistory(migrationPrompt.localTrades);
    localStorage.setItem(STORAGE_KEY, serializeProgressSnapshot(migrationPrompt.localProgress));
    localStorage.setItem(TRADE_HISTORY_STORAGE_KEY, JSON.stringify(migrationPrompt.localTrades));
    setMigrationPrompt(null);
  };

  const combineLocalAndCloudData = async () => {
    if (!migrationPrompt) {
      return;
    }

    const nextProgress = mergeProgress(migrationPrompt.localProgress, migrationPrompt.remoteProgress);
    const nextTrades = mergeTrades(migrationPrompt.localTrades, migrationPrompt.remoteTrades);

    await saveProgressAndTradesRemote(nextProgress, nextTrades);
    setProgress(nextProgress);
    setTradeHistory(nextTrades);
    localStorage.setItem(STORAGE_KEY, serializeProgressSnapshot(nextProgress));
    localStorage.setItem(TRADE_HISTORY_STORAGE_KEY, JSON.stringify(nextTrades));
    setMigrationPrompt(null);
  };

  const cancelMigration = () => {
    if (!migrationPrompt) {
      return;
    }

    lastSavedProgress.current = serializeProgressSnapshot(migrationPrompt.localProgress);
    clearSaveTimer();
    updatePendingCloudChanges(false);
    setMigrationPrompt(null);
    setSyncStatus("cloud");
  };

  const addTrade = (trade: TradeRecord) => {
    setTradeHistory((currentHistory) => [trade, ...currentHistory]);

    if (isCloudEnabled && userId) {
      insertRemoteTrade(userId, trade)
        .then(() => clearSyncIssue("trades", "save"))
        .catch(() => {
          addSyncIssue(createSyncIssue("trades", "save"));
          setSyncStatus("error");
        });
    }
  };

  const addPendingTrade = (trade: PendingTradeRecord) => {
    setPendingTrades((currentTrades) => [trade, ...currentTrades.filter((currentTrade) => currentTrade.id !== trade.id)]);

    if (isCloudEnabled && userId) {
      upsertRemotePendingTrade(userId, trade)
        .then(() => {
          addSyncedPendingTradeId(trade.id);
          clearSyncIssue("pending-trades", "save");
        })
        .catch(() => {
          addSyncIssue(createSyncIssue("pending-trades", "save"));
          setSyncStatus("error");
        });
    }
  };

  const updatePendingTrade = (trade: PendingTradeRecord) => {
    setPendingTrades((currentTrades) =>
      [trade, ...currentTrades.filter((currentTrade) => currentTrade.id !== trade.id)].sort((a, b) => b.reservedAt.localeCompare(a.reservedAt)),
    );

    if (isCloudEnabled && userId) {
      upsertRemotePendingTrade(userId, trade)
        .then(() => {
          addSyncedPendingTradeId(trade.id);
          clearSyncIssue("pending-trades", "save");
        })
        .catch(() => {
          addSyncIssue(createSyncIssue("pending-trades", "save"));
          setSyncStatus("error");
        });
    }
  };

  const deletePendingTrade = (tradeId: string, shouldRestoreOnFailure = true) => {
    let deletedTrade: PendingTradeRecord | undefined;
    setPendingTrades((currentTrades) => {
      deletedTrade = currentTrades.find((trade) => trade.id === tradeId);
      return currentTrades.filter((trade) => trade.id !== tradeId);
    });

    if (isCloudEnabled && userId) {
      deleteRemotePendingTrade(userId, tradeId)
        .then(() => clearSyncIssue("pending-trades", "delete"))
        .catch(() => {
          const tradeToRestore = deletedTrade;

          if (shouldRestoreOnFailure && tradeToRestore) {
            setPendingTrades((currentTrades) => [tradeToRestore, ...currentTrades.filter((trade) => trade.id !== tradeId)]);
          }

          addSyncIssue(createSyncIssue("pending-trades", "delete"));
          setSyncStatus("error");
        });
    }
  };

  const addRegistrationEvent = (event: RegistrationEvent) => {
    setRegistrationEvents((currentEvents) => [event, ...currentEvents.filter((currentEvent) => currentEvent.id !== event.id)]);

    if (isCloudEnabled && userId) {
      insertRemoteRegistrationEvent(userId, event)
        .then(() => clearSyncIssue("registration-events", "save"))
        .catch(() => {
          addSyncIssue(createSyncIssue("registration-events", "save"));
          setSyncStatus("error");
        });
    }
  };

  const deleteRegistrationEvent = (eventId: string) => {
    setRegistrationEvents((currentEvents) => currentEvents.filter((event) => event.id !== eventId));

    if (isCloudEnabled && userId) {
      deleteRemoteRegistrationEvent(userId, eventId)
        .then(() => clearSyncIssue("registration-events", "delete"))
        .catch(() => {
          addSyncIssue(createSyncIssue("registration-events", "delete"));
          setSyncStatus("error");
        });
    }
  };

  const updateTrade = (oldTrade: TradeRecord, nextTrade: TradeRecord, nextProgress: Progress) => {
    const nextTrades = [nextTrade, ...tradeHistory.filter((trade) => trade.id !== oldTrade.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setTradeHistory(nextTrades);

    if (isCloudEnabled && userId) {
      saveProgressAndTradesRemote(nextProgress, nextTrades).catch(() => {
        // saveProgressAndTradesRemote already records the sync issue.
      });
    }
  };

  const deleteTrade = (tradeId: string, nextProgress?: Progress) => {
    setTradeHistory(tradeHistory.filter((trade) => trade.id !== tradeId));

    if (isCloudEnabled && userId) {
      let progressSaved = false;
      const deleteRemote = async () => {
        if (nextProgress) {
          const updatedAt = await saveRemoteProgress(userId, nextProgress);
          progressSaved = true;
          lastSavedProgress.current = serializeProgressSnapshot(nextProgress);
          setLastCloudSyncAt(updatedAt);
          setLastLocalUpdateAt(writeLocalMeta(updatedAt));
          updatePendingCloudChanges(false);
        }

        await deleteRemoteTrade(userId, tradeId);
        clearSyncIssue("trades", "delete");
        clearSyncIssue("progress", "save");
        setSyncStatus("cloud");
      };

      clearSaveTimer();
      setSyncStatus("saving");
      updatePendingCloudChanges(Boolean(nextProgress));
      deleteRemote()
        .catch(() => {
          addSyncIssue(createSyncIssue(nextProgress && !progressSaved ? "progress" : "trades", nextProgress && !progressSaved ? "save" : "delete"));
          updatePendingCloudChanges(nextProgress ? serializeProgressSnapshot(nextProgress) !== lastSavedProgress.current : hasPendingCloudChangesRef.current);
          setSyncStatus("error");
        });
    }
  };

  const retryCloudSync = async () => {
    if (!isCloudEnabled || !userId) {
      return;
    }

    setSyncStatus("loading");
    setSyncRetryToken((currentToken) => currentToken + 1);

    if (hasPendingCloudChangesRef.current) {
      await flushPendingProgress(undefined, true);
    }
  };

  return {
    addRegistrationEvent,
    addPendingTrade,
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
    retryCloudSync,
    setProgress,
    syncIssues,
    syncNow: () => flushPendingProgress(undefined, true),
    syncStatus,
    tradeHistory,
    updateTrade,
    updatePendingTrade,
    uploadLocalData,
    useCloudData,
  };
}
