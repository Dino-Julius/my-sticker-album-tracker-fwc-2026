import type { UserProfile } from "../types";
import { supabase } from "./supabase";

type ProfileRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  nickname: string | null;
  updated_at: string;
};

function toUserProfile(row: ProfileRow): UserProfile {
  return {
    userId: row.user_id,
    email: row.email ?? undefined,
    fullName: row.full_name ?? undefined,
    nickname: row.nickname ?? undefined,
    updatedAt: row.updated_at,
  };
}

export async function loadRemoteProfile(userId: string): Promise<UserProfile | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id,email,full_name,nickname,updated_at")
    .eq("user_id", userId)
    .maybeSingle<ProfileRow>();

  if (error) {
    throw error;
  }

  return data ? toUserProfile(data) : null;
}

export async function saveRemoteProfile(profile: UserProfile): Promise<UserProfile> {
  if (!supabase) {
    return profile;
  }

  const updatedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: profile.userId,
        email: profile.email ?? null,
        full_name: profile.fullName ?? null,
        nickname: profile.nickname ?? null,
        updated_at: updatedAt,
      },
      { onConflict: "user_id" },
    )
    .select("user_id,email,full_name,nickname,updated_at")
    .single<ProfileRow>();

  if (error) {
    throw error;
  }

  return toUserProfile(data);
}
