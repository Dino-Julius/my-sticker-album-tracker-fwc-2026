import type {
  FriendExchangeSnapshot,
  FriendInvite,
  FriendInviteStatus,
  FriendPublicProfile,
  Friendship,
  FriendshipStatus,
} from "../types";
import { supabase } from "./supabase";

type FriendInviteRow = {
  id: string;
  code: string;
  created_by_user_id: string;
  created_at: string;
  expires_at: string;
  used_by_user_id: string | null;
  used_at: string | null;
  status: FriendInviteStatus;
};

type FriendshipRow = {
  id: string;
  requester_user_id: string;
  receiver_user_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
};

type FriendPublicProfileRow = {
  user_id: string;
  display_name: string;
  updated_at: string;
};

type FriendExchangeSnapshotRow = {
  user_id: string;
  display_name: string;
  completion_percentage: number;
  owned_count: number;
  missing_count: number;
  repeated_count: number;
  extras_count: number;
  missing_codes: string[];
  extras: Record<string, number>;
  updated_at: string;
};

function toFriendInvite(row: FriendInviteRow): FriendInvite {
  return {
    code: row.code,
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id,
    expiresAt: row.expires_at,
    id: row.id,
    status: row.status,
    usedAt: row.used_at ?? undefined,
    usedByUserId: row.used_by_user_id ?? undefined,
  };
}

function toFriendship(row: FriendshipRow): Friendship {
  return {
    createdAt: row.created_at,
    id: row.id,
    receiverUserId: row.receiver_user_id,
    requesterUserId: row.requester_user_id,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function toFriendPublicProfile(row: FriendPublicProfileRow): FriendPublicProfile {
  return {
    displayName: row.display_name,
    updatedAt: row.updated_at,
    userId: row.user_id,
  };
}

function toFriendExchangeSnapshot(row: FriendExchangeSnapshotRow): FriendExchangeSnapshot {
  return {
    completionPercentage: row.completion_percentage,
    displayName: row.display_name,
    extras: row.extras ?? {},
    extrasCount: row.extras_count,
    missingCodes: Array.isArray(row.missing_codes) ? row.missing_codes : [],
    missingCount: row.missing_count,
    ownedCount: row.owned_count,
    repeatedCount: row.repeated_count,
    updatedAt: row.updated_at,
    userId: row.user_id,
  };
}

function toFriendPublicProfileRow(profile: FriendPublicProfile): FriendPublicProfileRow {
  return {
    display_name: profile.displayName,
    updated_at: profile.updatedAt,
    user_id: profile.userId,
  };
}

function toFriendExchangeSnapshotRow(snapshot: FriendExchangeSnapshot): FriendExchangeSnapshotRow {
  return {
    completion_percentage: snapshot.completionPercentage,
    display_name: snapshot.displayName,
    extras: snapshot.extras,
    extras_count: snapshot.extrasCount,
    missing_codes: snapshot.missingCodes,
    missing_count: snapshot.missingCount,
    owned_count: snapshot.ownedCount,
    repeated_count: snapshot.repeatedCount,
    updated_at: snapshot.updatedAt,
    user_id: snapshot.userId,
  };
}

export async function createRemoteFriendInvite(): Promise<FriendInvite | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc("create_friend_invite").single<FriendInviteRow>();

  if (error) {
    throw error;
  }

  return data ? toFriendInvite(data) : null;
}

export async function loadRemoteFriendInvites(userId: string): Promise<FriendInvite[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("friend_invites")
    .select("id,code,created_by_user_id,created_at,expires_at,used_by_user_id,used_at,status")
    .eq("created_by_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => toFriendInvite(row as FriendInviteRow));
}

export async function redeemRemoteFriendInvite(code: string): Promise<Friendship | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc("redeem_friend_invite", { p_code: code }).single<FriendshipRow>();

  if (error) {
    throw error;
  }

  return data ? toFriendship(data) : null;
}

export async function revokeRemoteFriendInvite(inviteId: string): Promise<FriendInvite | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc("revoke_friend_invite", { p_invite_id: inviteId }).single<FriendInviteRow>();

  if (error) {
    throw error;
  }

  return data ? toFriendInvite(data) : null;
}

export async function loadRemoteFriendships(userId: string): Promise<Friendship[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("friendships")
    .select("id,requester_user_id,receiver_user_id,status,created_at,updated_at")
    .or(`requester_user_id.eq.${userId},receiver_user_id.eq.${userId}`)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => toFriendship(row as FriendshipRow));
}

export async function respondRemoteFriendRequest(friendshipId: string, action: "accept" | "reject"): Promise<Friendship | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .rpc("respond_friend_request", { p_action: action, p_friendship_id: friendshipId })
    .single<FriendshipRow>();

  if (error) {
    throw error;
  }

  return data ? toFriendship(data) : null;
}

export async function removeRemoteFriendship(friendshipId: string): Promise<Friendship | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc("remove_friend", { p_friendship_id: friendshipId }).single<FriendshipRow>();

  if (error) {
    throw error;
  }

  return data ? toFriendship(data) : null;
}

export async function loadRemoteFriendPublicProfiles(userIds: string[]): Promise<FriendPublicProfile[]> {
  if (!supabase || userIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("friend_public_profiles")
    .select("user_id,display_name,updated_at")
    .in("user_id", [...new Set(userIds)]);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => toFriendPublicProfile(row as FriendPublicProfileRow));
}

export async function upsertRemoteFriendPublicProfile(profile: FriendPublicProfile): Promise<void> {
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("friend_public_profiles")
    .upsert(toFriendPublicProfileRow(profile), { onConflict: "user_id" });

  if (error) {
    throw error;
  }
}

export async function loadRemoteFriendExchangeSnapshots(userIds: string[]): Promise<FriendExchangeSnapshot[]> {
  if (!supabase || userIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("friend_exchange_snapshots")
    .select(
      "user_id,display_name,completion_percentage,owned_count,missing_count,repeated_count,extras_count,missing_codes,extras,updated_at",
    )
    .in("user_id", [...new Set(userIds)]);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => toFriendExchangeSnapshot(row as FriendExchangeSnapshotRow));
}

export async function upsertRemoteFriendExchangeSnapshot(snapshot: FriendExchangeSnapshot): Promise<void> {
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("friend_exchange_snapshots")
    .upsert(toFriendExchangeSnapshotRow(snapshot), { onConflict: "user_id" });

  if (error) {
    throw error;
  }
}
