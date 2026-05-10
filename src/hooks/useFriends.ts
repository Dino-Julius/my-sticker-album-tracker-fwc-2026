import { useEffect, useMemo, useState } from "react";
import type { FriendExchangeSnapshot, FriendInvite, FriendPublicProfile, Friendship, PendingTradeRecord, Progress, Sticker, UserProfile } from "../types";
import { getCompletionPercentage, getMissingStickers, getOwnedStickers, getRepeatedStickers, getStickerQuantity } from "../lib/album";
import {
  createRemoteFriendInvite,
  loadRemoteFriendExchangeSnapshots,
  loadRemoteFriendInvites,
  loadRemoteFriendPublicProfiles,
  loadRemoteFriendships,
  redeemRemoteFriendInvite,
  removeRemoteFriendship,
  respondRemoteFriendRequest,
  revokeRemoteFriendInvite,
  upsertRemoteFriendExchangeSnapshot,
  upsertRemoteFriendPublicProfile,
} from "../lib/remoteFriends";

export type FriendListItem = Friendship & {
  friendUserId: string;
  displayName: string;
  profileUpdatedAt?: string;
  snapshot?: FriendExchangeSnapshot;
};

type FriendsMessage = {
  type: "success" | "warning" | "error";
  text: string;
};

function getProfileDisplayName(profile: UserProfile | null) {
  return profile?.nickname || profile?.fullName || "Coleccionista";
}

function getOtherUserId(friendship: Friendship, userId: string) {
  return friendship.requesterUserId === userId ? friendship.receiverUserId : friendship.requesterUserId;
}

function isMissingFriendsSetupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /friend_|create_friend|relation .* does not exist|function .* does not exist/i.test(message);
}

function getFriendlyFriendsError(error: unknown) {
  if (isMissingFriendsSetupError(error)) {
    return "Amigos todavía no está configurado en la nube. Aplica el SQL de Phase B para activar esta función.";
  }

  return "No se pudo actualizar Amigos. Intenta de nuevo.";
}

function getReservedExtrasByCode(pendingTrades: PendingTradeRecord[]) {
  return pendingTrades.reduce<Record<string, number>>((reserved, trade) => {
    trade.gave.forEach((item) => {
      reserved[item.code] = (reserved[item.code] ?? 0) + item.quantity;
    });

    return reserved;
  }, {});
}

function createFriendExchangeSnapshot({
  catalog,
  displayName,
  pendingTrades,
  progress,
  userId,
}: {
  catalog: Sticker[];
  displayName: string;
  pendingTrades: PendingTradeRecord[];
  progress: Progress;
  userId: string;
}): FriendExchangeSnapshot {
  const reservedExtras = getReservedExtrasByCode(pendingTrades);
  const extras = catalog.reduce<Record<string, number>>((availableExtras, sticker) => {
    const available = Math.max(0, getStickerQuantity(sticker.code, progress) - 1 - (reservedExtras[sticker.code] ?? 0));

    if (available > 0) {
      availableExtras[sticker.code] = available;
    }

    return availableExtras;
  }, {});

  return {
    completionPercentage: getCompletionPercentage(catalog, progress),
    displayName,
    extras,
    extrasCount: Object.values(extras).reduce((total, quantity) => total + quantity, 0),
    missingCodes: getMissingStickers(catalog, progress).map((sticker) => sticker.code),
    missingCount: getMissingStickers(catalog, progress).length,
    ownedCount: getOwnedStickers(catalog, progress).length,
    repeatedCount: getRepeatedStickers(catalog, progress).length,
    updatedAt: new Date().toISOString(),
    userId,
  };
}

export function useFriends({
  catalog,
  isCloudEnabled,
  pendingTrades,
  profile,
  progress,
  userId,
}: {
  catalog: Sticker[];
  isCloudEnabled: boolean;
  pendingTrades: PendingTradeRecord[];
  profile: UserProfile | null;
  progress: Progress;
  userId?: string;
}) {
  const [invites, setInvites] = useState<FriendInvite[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<FriendPublicProfile[]>([]);
  const [snapshots, setSnapshots] = useState<FriendExchangeSnapshot[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isUpdatingFriends, setIsUpdatingFriends] = useState(false);
  const [friendsMessage, setFriendsMessage] = useState<FriendsMessage | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refreshFriends = () => setRefreshToken((currentToken) => currentToken + 1);

  useEffect(() => {
    setInvites([]);
    setFriendships([]);
    setProfiles([]);
    setSnapshots([]);
    setFriendsMessage(null);

    if (!isCloudEnabled || !userId) {
      return;
    }

    let isActive = true;
    setIsLoadingFriends(true);

    Promise.all([loadRemoteFriendInvites(userId), loadRemoteFriendships(userId)])
      .then(async ([nextInvites, nextFriendships]) => {
        if (!isActive) {
          return;
        }

        setInvites(nextInvites);
        setFriendships(nextFriendships);
        const friendUserIds = [...new Set(nextFriendships.map((friendship) => getOtherUserId(friendship, userId)))];

        try {
          const [nextProfiles, nextSnapshots] = await Promise.all([
            loadRemoteFriendPublicProfiles(friendUserIds),
            loadRemoteFriendExchangeSnapshots(
              friendUserIds.filter((friendUserId) =>
                nextFriendships.some(
                  (friendship) =>
                    friendship.status === "accepted" &&
                    (friendship.requesterUserId === friendUserId || friendship.receiverUserId === friendUserId),
                ),
              ),
            ),
          ]);
          if (isActive) {
            setProfiles(nextProfiles);
            setSnapshots(nextSnapshots);
          }
        } catch {
          if (isActive) {
            setProfiles([]);
            setSnapshots([]);
          }
        }
      })
      .catch((error) => {
        if (isActive) {
          setFriendsMessage({ type: "warning", text: getFriendlyFriendsError(error) });
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingFriends(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [isCloudEnabled, refreshToken, userId]);

  useEffect(() => {
    if (!isCloudEnabled || !userId) {
      return;
    }

    const displayName = getProfileDisplayName(profile);

    upsertRemoteFriendPublicProfile({
      displayName,
      updatedAt: new Date().toISOString(),
      userId,
    }).catch((error) => {
      setFriendsMessage({ type: "warning", text: getFriendlyFriendsError(error) });
    });
  }, [isCloudEnabled, profile?.fullName, profile?.nickname, userId]);

  useEffect(() => {
    if (!isCloudEnabled || !userId || catalog.length === 0) {
      return;
    }

    const displayName = getProfileDisplayName(profile);
    const timeoutId = window.setTimeout(() => {
      const snapshot = createFriendExchangeSnapshot({
        catalog,
        displayName,
        pendingTrades,
        progress,
        userId,
      });

      upsertRemoteFriendExchangeSnapshot(snapshot).catch((error) => {
        setFriendsMessage({ type: "warning", text: getFriendlyFriendsError(error) });
      });
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [catalog, isCloudEnabled, pendingTrades, profile?.fullName, profile?.nickname, progress, userId]);

  const profilesByUserId = useMemo(() => new Map(profiles.map((friendProfile) => [friendProfile.userId, friendProfile])), [profiles]);
  const snapshotsByUserId = useMemo(() => new Map(snapshots.map((snapshot) => [snapshot.userId, snapshot])), [snapshots]);

  const friendItems = useMemo<FriendListItem[]>(() => {
    if (!userId) {
      return [];
    }

    return friendships.map((friendship) => {
      const friendUserId = getOtherUserId(friendship, userId);
      const friendProfile = profilesByUserId.get(friendUserId);
      const snapshot = snapshotsByUserId.get(friendUserId);

      return {
        ...friendship,
        displayName: snapshot?.displayName || friendProfile?.displayName || "Amigo",
        friendUserId,
        profileUpdatedAt: friendProfile?.updatedAt,
        snapshot,
      };
    });
  }, [friendships, profilesByUserId, snapshotsByUserId, userId]);

  const runFriendAction = async (action: () => Promise<void>, successMessage: string) => {
    if (!isCloudEnabled || !userId) {
      setFriendsMessage({ type: "warning", text: "Inicia sesión con Google para usar Amigos." });
      return;
    }

    setIsUpdatingFriends(true);
    setFriendsMessage(null);

    try {
      await action();
      setFriendsMessage({ type: "success", text: successMessage });
      refreshFriends();
    } catch (error) {
      setFriendsMessage({ type: "error", text: getFriendlyFriendsError(error) });
    } finally {
      setIsUpdatingFriends(false);
    }
  };

  const createInvite = () =>
    runFriendAction(async () => {
      await createRemoteFriendInvite();
    }, "Código de amigo creado.");

  const redeemInvite = (code: string) =>
    runFriendAction(async () => {
      await redeemRemoteFriendInvite(code);
    }, "Solicitud enviada.");

  const revokeInvite = (inviteId: string) =>
    runFriendAction(async () => {
      await revokeRemoteFriendInvite(inviteId);
    }, "Código revocado.");

  const respondToRequest = (friendshipId: string, action: "accept" | "reject") =>
    runFriendAction(async () => {
      await respondRemoteFriendRequest(friendshipId, action);
    }, action === "accept" ? "Solicitud aceptada." : "Solicitud rechazada.");

  const removeFriend = (friendshipId: string) =>
    runFriendAction(async () => {
      await removeRemoteFriendship(friendshipId);
    }, "Amigo eliminado.");

  return {
    acceptedFriends: friendItems.filter((friendship) => friendship.status === "accepted"),
    activeInvites: invites.filter((invite) => invite.status === "active"),
    createInvite,
    friendsMessage,
    incomingRequests: friendItems.filter((friendship) => friendship.status === "pending" && friendship.receiverUserId === userId),
    invites,
    isLoadingFriends,
    isUpdatingFriends,
    outgoingRequests: friendItems.filter((friendship) => friendship.status === "pending" && friendship.requesterUserId === userId),
    redeemInvite,
    refreshFriends,
    removeFriend,
    respondToRequest,
    revokeInvite,
  };
}
