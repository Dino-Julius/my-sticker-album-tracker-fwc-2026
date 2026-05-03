import { useCallback, useEffect, useRef, useState } from "react";
import type { Progress, TradeRecord } from "../types";
import { loadRemoteProgress, saveRemoteProgress } from "../lib/remoteProgress";
import { deleteRemoteTrade, insertRemoteTrade, loadRemoteTrades } from "../lib/remoteTrades";
import { STORAGE_KEY, TRADE_HISTORY_STORAGE_KEY } from "../lib/album";

const CLOUD_SYNC_DEBOUNCE_MS = 7000;
const UNSYNCED_CHANGES_MESSAGE = "Tienes cambios guardados en este dispositivo, pero aún no sincronizados en la nube.";

export type SyncStatus = "local" | "loading" | "pending" | "saving" | "cloud" | "error";
export type MigrationPrompt =
  | {
      type: "upload-local";
      localProgress: Progress;
      localTrades: TradeRecord[];
      remoteProgress: Progress;
      remoteTrades: TradeRecord[];
    }
  | {
      type: "resolve-conflict";
      localProgress: Progress;
      localTrades: TradeRecord[];
      remoteProgress: Progress;
      remoteTrades: TradeRecord[];
    };

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

export function useAlbumData({ isCloudEnabled, userId }: { isCloudEnabled: boolean; userId?: string }) {
  const [progress, setProgress] = useState<Progress>(() => readLocalProgress());
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>(() => readLocalTrades());
  const [migrationPrompt, setMigrationPrompt] = useState<MigrationPrompt | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [hasPendingCloudChanges, setHasPendingCloudChanges] = useState(false);
  const hasLoadedRemote = useRef(false);
  const lastSavedProgress = useRef("");
  const latestProgress = useRef(progress);
  const latestSerializedProgress = useRef(JSON.stringify(progress));
  const saveTimerId = useRef<number | null>(null);
  const isSavingProgress = useRef(false);
  const saveAgainAfterCurrent = useRef(false);
  const hasPendingCloudChangesRef = useRef(false);
  const flushPendingProgressRef = useRef<() => Promise<void>>(async () => {});

  latestProgress.current = progress;
  latestSerializedProgress.current = JSON.stringify(progress);

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
      const serializedProgress = JSON.stringify(progressToSave);

      if (serializedProgress === lastSavedProgress.current && !hasPendingCloudChangesRef.current) {
        updatePendingCloudChanges(false);
        setSyncStatus("cloud");
        return;
      }

      clearSaveTimer();
      isSavingProgress.current = true;
      setSyncStatus("saving");

      try {
        await saveRemoteProgress(userId, progressToSave);
        lastSavedProgress.current = serializedProgress;

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
    [clearSaveTimer, isCloudEnabled, schedulePendingSave, updatePendingCloudChanges, userId],
  );

  useEffect(() => {
    flushPendingProgressRef.current = flushPendingProgress;
  }, [flushPendingProgress]);

  useEffect(() => () => clearSaveTimer(), [clearSaveTimer]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, latestSerializedProgress.current);
  }, [progress]);

  useEffect(() => {
    localStorage.setItem(TRADE_HISTORY_STORAGE_KEY, JSON.stringify(tradeHistory));
  }, [tradeHistory]);

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
    const localTrades = readLocalTrades();

    Promise.all([loadRemoteProgress(userId), loadRemoteTrades(userId)])
      .then(([remoteProgress, remoteTrades]) => {
        if (!isActive) {
          return;
        }

        const normalizedRemoteProgress = remoteProgress ?? {};
        const localHasData = hasLocalData(localProgress, localTrades);
        const remoteHasData = hasLocalData(normalizedRemoteProgress, remoteTrades);

        if (localHasData && !remoteHasData) {
          setMigrationPrompt({
            type: "upload-local",
            localProgress,
            localTrades,
            remoteProgress: normalizedRemoteProgress,
            remoteTrades,
          });
          lastSavedProgress.current = JSON.stringify(localProgress);
          updatePendingCloudChanges(false);
        } else if (localHasData && remoteHasData) {
          setMigrationPrompt({
            type: "resolve-conflict",
            localProgress,
            localTrades,
            remoteProgress: normalizedRemoteProgress,
            remoteTrades,
          });
          lastSavedProgress.current = JSON.stringify(localProgress);
          updatePendingCloudChanges(false);
        } else if (remoteHasData) {
          setProgress(normalizedRemoteProgress);
          setTradeHistory(remoteTrades);
          lastSavedProgress.current = JSON.stringify(normalizedRemoteProgress);
          updatePendingCloudChanges(false);
        } else {
          lastSavedProgress.current = JSON.stringify(localProgress);
          updatePendingCloudChanges(false);
        }

        hasLoadedRemote.current = true;
        setSyncStatus("cloud");
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        hasLoadedRemote.current = true;
        setSyncStatus("error");
      });

    return () => {
      isActive = false;
    };
  }, [clearSaveTimer, isCloudEnabled, updatePendingCloudChanges, userId]);

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
    try {
      await saveRemoteProgress(userId, nextProgress);
      lastSavedProgress.current = JSON.stringify(nextProgress);
      updatePendingCloudChanges(false);
      await Promise.all(nextTrades.map((trade) => insertRemoteTrade(userId, trade)));
      setSyncStatus("cloud");
    } catch (error) {
      updatePendingCloudChanges(JSON.stringify(nextProgress) !== lastSavedProgress.current);
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
    lastSavedProgress.current = JSON.stringify(migrationPrompt.remoteProgress);
    clearSaveTimer();
    updatePendingCloudChanges(false);
    setMigrationPrompt(null);
    setSyncStatus("cloud");
  };

  const uploadLocalData = () => {
    if (!migrationPrompt) {
      return;
    }

    setProgress(migrationPrompt.localProgress);
    setTradeHistory(migrationPrompt.localTrades);
    setMigrationPrompt(null);
    saveProgressAndTradesRemote(migrationPrompt.localProgress, migrationPrompt.localTrades).catch(() => {});
  };

  const combineLocalAndCloudData = () => {
    if (!migrationPrompt) {
      return;
    }

    const nextProgress = mergeProgress(migrationPrompt.localProgress, migrationPrompt.remoteProgress);
    const nextTrades = mergeTrades(migrationPrompt.localTrades, migrationPrompt.remoteTrades);

    setProgress(nextProgress);
    setTradeHistory(nextTrades);
    setMigrationPrompt(null);
    saveProgressAndTradesRemote(nextProgress, nextTrades).catch(() => {});
  };

  const addTrade = (trade: TradeRecord) => {
    setTradeHistory((currentHistory) => [trade, ...currentHistory]);

    if (isCloudEnabled && userId) {
      insertRemoteTrade(userId, trade).catch(() => {
        setSyncStatus("error");
      });
    }
  };

  const deleteTrade = (tradeId: string) => {
    setTradeHistory((currentHistory) => currentHistory.filter((trade) => trade.id !== tradeId));

    if (isCloudEnabled && userId) {
      deleteRemoteTrade(userId, tradeId).catch(() => {
        setSyncStatus("error");
      });
    }
  };

  return {
    addTrade,
    combineLocalAndCloudData,
    deleteTrade,
    hasPendingCloudChanges,
    migrationPrompt,
    progress,
    setProgress,
    syncNow: () => flushPendingProgress(undefined, true),
    syncStatus,
    tradeHistory,
    uploadLocalData,
    useCloudData,
  };
}
