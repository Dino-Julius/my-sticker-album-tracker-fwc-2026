import { useEffect, useRef, useState } from "react";
import type { Progress, TradeRecord } from "../types";
import { loadRemoteProgress, saveRemoteProgress } from "../lib/remoteProgress";
import { deleteRemoteTrade, insertRemoteTrade, loadRemoteTrades } from "../lib/remoteTrades";
import { STORAGE_KEY, TRADE_HISTORY_STORAGE_KEY } from "../lib/album";

export type SyncStatus = "local" | "loading" | "saving" | "cloud" | "error";

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

export function useAlbumData({ isCloudEnabled, userId }: { isCloudEnabled: boolean; userId?: string }) {
  const [progress, setProgress] = useState<Progress>(() => readLocalProgress());
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>(() => readLocalTrades());
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

    if (!isCloudEnabled || !userId) {
      setSyncStatus("local");
      return;
    }

    let isActive = true;
    setSyncStatus("loading");

    Promise.all([loadRemoteProgress(userId), loadRemoteTrades(userId)])
      .then(([remoteProgress, remoteTrades]) => {
        if (!isActive) {
          return;
        }

        if (remoteProgress && Object.keys(remoteProgress).length > 0) {
          setProgress(remoteProgress);
          lastSavedProgress.current = JSON.stringify(remoteProgress);
        }

        if (remoteTrades.length > 0) {
          setTradeHistory(remoteTrades);
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
    if (!isCloudEnabled || !userId || !hasLoadedRemote.current) {
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
  }, [isCloudEnabled, progress, userId]);

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
    deleteTrade,
    progress,
    setProgress,
    syncStatus,
    tradeHistory,
  };
}
