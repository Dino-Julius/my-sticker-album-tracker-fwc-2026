import type { RegistrationEvent, RegistrationEventAction, RegistrationEventItem, RegistrationEventSource } from "../types";
import { supabase } from "./supabase";

type RegistrationEventRow = {
  user_id: string;
  id: string;
  created_at: string;
  source: RegistrationEventSource;
  action: RegistrationEventAction;
  items: RegistrationEventItem[];
  note: string | null;
  saved_at: string;
};

function toRegistrationEvent(row: RegistrationEventRow): RegistrationEvent {
  return {
    id: row.id,
    createdAt: row.created_at,
    source: row.source,
    action: row.action,
    items: row.items,
    note: row.note ?? undefined,
  };
}

function toRegistrationEventRow(userId: string, event: RegistrationEvent): Omit<RegistrationEventRow, "saved_at"> {
  return {
    user_id: userId,
    id: event.id,
    created_at: event.createdAt,
    source: event.source,
    action: event.action,
    items: event.items,
    note: event.note ?? null,
  };
}

export async function loadRemoteRegistrationEvents(userId: string): Promise<RegistrationEvent[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("registration_events")
    .select("user_id,id,created_at,source,action,items,note,saved_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => toRegistrationEvent(row as RegistrationEventRow));
}

export async function insertRemoteRegistrationEvent(userId: string, event: RegistrationEvent): Promise<void> {
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("registration_events")
    .upsert(
      { ...toRegistrationEventRow(userId, event), saved_at: new Date().toISOString() },
      { onConflict: "user_id,id" },
    );

  if (error) {
    throw error;
  }
}

export async function deleteRemoteRegistrationEvent(userId: string, eventId: string): Promise<void> {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("registration_events").delete().eq("user_id", userId).eq("id", eventId);

  if (error) {
    throw error;
  }
}
