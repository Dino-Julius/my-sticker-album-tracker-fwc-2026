import type { Progress } from "../types";
import { supabase } from "./supabase";

type ProgressRow = {
  user_id: string;
  progress: Progress;
  updated_at: string;
};

export type RemoteProgressSnapshot = {
  progress: Progress;
  updatedAt?: string;
};

export async function loadRemoteProgress(userId: string): Promise<RemoteProgressSnapshot | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("album_progress")
    .select("progress,updated_at")
    .eq("user_id", userId)
    .maybeSingle<Pick<ProgressRow, "progress" | "updated_at">>();

  if (error) {
    throw error;
  }

  return data ? { progress: data.progress ?? {}, updatedAt: data.updated_at } : null;
}

export async function saveRemoteProgress(userId: string, progress: Progress): Promise<string | undefined> {
  if (!supabase) {
    return undefined;
  }

  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from("album_progress")
    .upsert(
      {
        user_id: userId,
        progress,
        updated_at: updatedAt,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    throw error;
  }

  return updatedAt;
}
