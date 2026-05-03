import { useEffect, useRef, useState } from "react";
import type { Progress } from "../types";
import { loadRemoteProgress, saveRemoteProgress } from "../lib/remoteProgress";
import { STORAGE_KEY } from "../lib/album";

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

export function useAlbumData({ isCloudEnabled, userId }: { isCloudEnabled: boolean; userId?: string }) {
  const [progress, setProgress] = useState<Progress>(() => readLocalProgress());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const hasLoadedRemote = useRef(false);
  const lastSavedProgress = useRef("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    hasLoadedRemote.current = false;
    lastSavedProgress.current = "";

    if (!isCloudEnabled || !userId) {
      setSyncStatus("local");
      return;
    }

    let isActive = true;
    setSyncStatus("loading");

    loadRemoteProgress(userId)
      .then((remoteProgress) => {
        if (!isActive) {
          return;
        }

        if (remoteProgress && Object.keys(remoteProgress).length > 0) {
          setProgress(remoteProgress);
          lastSavedProgress.current = JSON.stringify(remoteProgress);
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

  return {
    progress,
    setProgress,
    syncStatus,
  };
}
