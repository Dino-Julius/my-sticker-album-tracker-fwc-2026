import type { Progress } from "../types";
import { supabase } from "./supabase";

type ProgressRow = {
  user_id: string;
  progress: Progress;
  updated_at: string;
};

export async function loadRemoteProgress(userId: string): Promise<Progress | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("album_progress")
    .select("progress")
    .eq("user_id", userId)
    .maybeSingle<Pick<ProgressRow, "progress">>();

  if (error) {
    throw error;
  }

  return data?.progress ?? null;
}

export async function saveRemoteProgress(userId: string, progress: Progress): Promise<void> {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("album_progress").upsert(
    {
      user_id: userId,
      progress,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw error;
  }
}
