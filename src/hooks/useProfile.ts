import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { SyncIssue, UserProfile } from "../types";
import { loadRemoteProfile, saveRemoteProfile } from "../lib/remoteProfiles";

const profileIssueMessages = {
  load: "No se pudo cargar el perfil.",
  save: "No se pudo guardar perfil.",
};

function createProfileSyncIssue(operation: "load" | "save"): SyncIssue {
  return {
    area: "profile",
    createdAt: new Date().toISOString(),
    id: `profile-${operation}`,
    message: profileIssueMessages[operation],
    operation,
  };
}

function getGoogleFullName(user: User | null) {
  const metadata = user?.user_metadata;
  const fullName = typeof metadata?.full_name === "string" ? metadata.full_name : "";
  const name = typeof metadata?.name === "string" ? metadata.name : "";
  return fullName || name || undefined;
}

export function useProfile({ isCloudEnabled, user }: { isCloudEnabled: boolean; user: User | null }) {
  const [remoteProfile, setRemoteProfile] = useState<UserProfile | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSyncIssues, setProfileSyncIssues] = useState<SyncIssue[]>([]);
  const [profileMessage, setProfileMessage] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const userId = user?.id;
  const email = user?.email;
  const fullName = getGoogleFullName(user);

  useEffect(() => {
    setRemoteProfile(null);
    setProfileMessage("");

    if (!isCloudEnabled || !userId) {
      return;
    }

    let isActive = true;

    loadRemoteProfile(userId)
      .then((profile) => {
        if (isActive) {
          setRemoteProfile(profile);
          setProfileSyncIssues((issues) => issues.filter((issue) => issue.id !== "profile-load"));
        }
      })
      .catch(() => {
        if (isActive) {
          setProfileMessage("No se pudo cargar el perfil.");
          setProfileSyncIssues((issues) => [
            createProfileSyncIssue("load"),
            ...issues.filter((issue) => issue.id !== "profile-load"),
          ]);
        }
      });

    return () => {
      isActive = false;
    };
  }, [isCloudEnabled, retryToken, userId]);

  const profile = useMemo<UserProfile | null>(() => {
    if (!userId) {
      return null;
    }

    return {
      userId,
      email: email ?? remoteProfile?.email,
      fullName: fullName ?? remoteProfile?.fullName,
      nickname: remoteProfile?.nickname,
      updatedAt: remoteProfile?.updatedAt,
    };
  }, [email, fullName, remoteProfile, userId]);

  const saveNickname = async (nickname: string) => {
    if (!profile || !isCloudEnabled) {
      return;
    }

    setIsSavingProfile(true);
    setProfileMessage("");

    try {
      const savedProfile = await saveRemoteProfile({
        ...profile,
        nickname: nickname.trim() || undefined,
      });
      setRemoteProfile(savedProfile);
      setProfileSyncIssues((issues) => issues.filter((issue) => issue.id !== "profile-save"));
      setProfileMessage("Apodo guardado.");
      window.setTimeout(() => {
        setProfileMessage((current) => (current === "Apodo guardado." ? "" : current));
      }, 3200);
    } catch {
      setProfileMessage("No se pudo guardar el apodo.");
      setProfileSyncIssues((issues) => [
        createProfileSyncIssue("save"),
        ...issues.filter((issue) => issue.id !== "profile-save"),
      ]);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const retryProfileSync = async () => {
    if (!isCloudEnabled || !userId) {
      return;
    }

    setRetryToken((currentToken) => currentToken + 1);
  };

  return {
    isSavingProfile,
    profile,
    profileMessage,
    retryProfileSync,
    saveNickname,
    syncIssues: profileSyncIssues,
  };
}
