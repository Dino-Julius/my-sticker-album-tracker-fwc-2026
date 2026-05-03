import { useEffect, useRef, useState } from "react";
import type { Progress, TradeRecord } from "../types";
import { loadRemoteProgress, saveRemoteProgress } from "../lib/remoteProgress";
import { deleteRemoteTrade, insertRemoteTrade, loadRemoteTrades } from "../lib/remoteTrades";
import { STORAGE_KEY, TRADE_HISTORY_STORAGE_KEY } from "../lib/album";

export type SyncStatus = "local" | "loading" | "saving" | "cloud" | "error";
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
  const hasLoadedRemote = useRef(false);
  const lastSavedProgress = useRef("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    localStorage.setItem(TRADE_HISTORY_STORAGE_KEY, JSON.stringify(tradeHistory));
  }, [tradeHistory]);

  useEffect(() => {
    hasLoadedRemote.current = false;
    lastSavedProgress.current = "";
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
        } else if (localHasData && remoteHasData) {
          setMigrationPrompt({
            type: "resolve-conflict",
            localProgress,
            localTrades,
            remoteProgress: normalizedRemoteProgress,
            remoteTrades,
          });
          lastSavedProgress.current = JSON.stringify(localProgress);
        } else if (remoteHasData) {
          setProgress(normalizedRemoteProgress);
          setTradeHistory(remoteTrades);
          lastSavedProgress.current = JSON.stringify(normalizedRemoteProgress);
        } else {
          lastSavedProgress.current = JSON.stringify(localProgress);
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
  }, [isCloudEnabled, userId]);

  useEffect(() => {
    if (!isCloudEnabled || !userId || !hasLoadedRemote.current || migrationPrompt) {
      return;
    }

    const serializedProgress = JSON.stringify(progress);

    if (serializedProgress === lastSavedProgress.current) {
      return;
    }

    setSyncStatus("saving");

    const timeoutId = window.setTimeout(() => {
      saveRemoteProgress(userId, progress)
        .then(() => {
          lastSavedProgress.current = serializedProgress;
          setSyncStatus("cloud");
        })
        .catch(() => {
          setSyncStatus("error");
        });
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isCloudEnabled, migrationPrompt, progress, userId]);

  const saveProgressAndTradesRemote = async (nextProgress: Progress, nextTrades: TradeRecord[]) => {
    if (!isCloudEnabled || !userId) {
      return;
    }

    setSyncStatus("saving");
    await saveRemoteProgress(userId, nextProgress);
    await Promise.all(nextTrades.map((trade) => insertRemoteTrade(userId, trade)));
    lastSavedProgress.current = JSON.stringify(nextProgress);
    setSyncStatus("cloud");
  };

  const useCloudData = () => {
    if (!migrationPrompt) {
      return;
    }

    setProgress(migrationPrompt.remoteProgress);
    setTradeHistory(migrationPrompt.remoteTrades);
    lastSavedProgress.current = JSON.stringify(migrationPrompt.remoteProgress);
    setMigrationPrompt(null);
  };

  const uploadLocalData = () => {
    if (!migrationPrompt) {
      return;
    }

    setProgress(migrationPrompt.localProgress);
    setTradeHistory(migrationPrompt.localTrades);
    setMigrationPrompt(null);
    saveProgressAndTradesRemote(migrationPrompt.localProgress, migrationPrompt.localTrades).catch(() => {
      setSyncStatus("error");
    });
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
    saveProgressAndTradesRemote(nextProgress, nextTrades).catch(() => {
      setSyncStatus("error");
    });
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
    migrationPrompt,
    progress,
    setProgress,
    syncStatus,
    tradeHistory,
    uploadLocalData,
    useCloudData,
  };
}
