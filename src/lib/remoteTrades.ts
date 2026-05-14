import type { TradeItem, TradeRecord, TradeSettlement } from "../types";
import { normalizeTradeSettlement } from "./album";
import { supabase } from "./supabase";

type TradeRecordRow = {
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

function toTradeRecord(row: TradeRecordRow): TradeRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    tradedWith: row.traded_with ?? undefined,
    notes: row.notes ?? undefined,
    gave: row.gave,
    received: row.received,
    settlement: normalizeTradeSettlement({ settlement: row.settlement ?? undefined }),
  };
}

function toTradeRecordRow(userId: string, trade: TradeRecord): Omit<TradeRecordRow, "saved_at"> {
  return {
    user_id: userId,
    id: trade.id,
    created_at: trade.createdAt,
    traded_with: trade.tradedWith ?? null,
    notes: trade.notes ?? null,
    gave: trade.gave,
    received: trade.received,
    settlement: normalizeTradeSettlement(trade),
  };
}

export async function loadRemoteTrades(userId: string): Promise<TradeRecord[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("trade_records")
    .select("user_id,id,created_at,traded_with,notes,gave,received,settlement,saved_at")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => toTradeRecord(row as TradeRecordRow));
}

export async function insertRemoteTrade(userId: string, trade: TradeRecord): Promise<void> {
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("trade_records")
    .upsert({ ...toTradeRecordRow(userId, trade), saved_at: new Date().toISOString() }, { onConflict: "user_id,id" });

  if (error) {
    throw error;
  }
}

export async function deleteRemoteTrade(userId: string, tradeId: string): Promise<void> {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("trade_records").delete().eq("user_id", userId).eq("id", tradeId);

  if (error) {
    throw error;
  }
}
