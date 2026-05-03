import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { UserProfile } from "../types";
import { loadRemoteProfile, saveRemoteProfile } from "../lib/remoteProfiles";

function getGoogleFullName(user: User | null) {
  const metadata = user?.user_metadata;
  const fullName = typeof metadata?.full_name === "string" ? metadata.full_name : "";
  const name = typeof metadata?.name === "string" ? metadata.name : "";
  return fullName || name || undefined;
}

export function useProfile({ isCloudEnabled, user }: { isCloudEnabled: boolean; user: User | null }) {
  const [remoteProfile, setRemoteProfile] = useState<UserProfile | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
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
        }
      })
      .catch(() => {
        if (isActive) {
          setProfileMessage("No se pudo cargar el perfil.");
        }
      });

    return () => {
      isActive = false;
    };
  }, [isCloudEnabled, userId]);

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
      setProfileMessage("Apodo guardado.");
      window.setTimeout(() => {
        setProfileMessage((current) => (current === "Apodo guardado." ? "" : current));
      }, 3200);
    } catch {
      setProfileMessage("No se pudo guardar el apodo.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  return {
    isSavingProfile,
    profile,
    profileMessage,
    saveNickname,
  };
}
