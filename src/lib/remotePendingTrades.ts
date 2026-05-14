import type { PendingTradeRecord, TradeItem, TradeSettlement } from "../types";
import { normalizeTradeSettlement } from "./album";
import { supabase } from "./supabase";

type PendingTradeRow = {
  user_id: string;
  id: string;
  created_at: string;
  traded_with: string | null;
  notes: string | null;
  gave: TradeItem[];
  received: TradeItem[];
  settlement: TradeSettlement | null;
  saved_at: string;
};

function toPendingTrade(row: PendingTradeRow): PendingTradeRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    reservedAt: row.saved_at,
    tradedWith: row.traded_with ?? undefined,
    notes: row.notes ?? undefined,
    gave: row.gave,
    received: row.received,
    settlement: normalizeTradeSettlement({ settlement: row.settlement ?? undefined }),
  };
}

function toPendingTradeRow(userId: string, trade: PendingTradeRecord): PendingTradeRow {
  return {
    user_id: userId,
    id: trade.id,
    created_at: trade.createdAt,
    traded_with: trade.tradedWith ?? null,
    notes: trade.notes ?? null,
    gave: trade.gave,
    received: trade.received,
    settlement: normalizeTradeSettlement(trade),
    saved_at: trade.reservedAt,
  };
}

export async function loadRemotePendingTrades(userId: string): Promise<PendingTradeRecord[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("pending_trades")
    .select("user_id,id,created_at,traded_with,notes,gave,received,settlement,saved_at")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => toPendingTrade(row as PendingTradeRow));
}

export async function upsertRemotePendingTrade(userId: string, pendingTrade: PendingTradeRecord): Promise<void> {
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("pending_trades")
    .upsert(toPendingTradeRow(userId, pendingTrade), { onConflict: "user_id,id" });

  if (error) {
    throw error;
  }
}

export async function deleteRemotePendingTrade(userId: string, pendingTradeId: string): Promise<void> {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("pending_trades").delete().eq("user_id", userId).eq("id", pendingTradeId);

  if (error) {
    throw error;
  }
}
