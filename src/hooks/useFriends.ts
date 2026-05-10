import { useEffect, useMemo, useState } from "react";
import type { FriendInvite, FriendPublicProfile, Friendship, UserProfile } from "../types";
import {
  createRemoteFriendInvite,
  loadRemoteFriendInvites,
  loadRemoteFriendPublicProfiles,
  loadRemoteFriendships,
  redeemRemoteFriendInvite,
  removeRemoteFriendship,
  respondRemoteFriendRequest,
  revokeRemoteFriendInvite,
  upsertRemoteFriendPublicProfile,
} from "../lib/remoteFriends";

export type FriendListItem = Friendship & {
  friendUserId: string;
  displayName: string;
  profileUpdatedAt?: string;
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

export function useFriends({
  isCloudEnabled,
  profile,
  userId,
}: {
  isCloudEnabled: boolean;
  profile: UserProfile | null;
  userId?: string;
}) {
  const [invites, setInvites] = useState<FriendInvite[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<FriendPublicProfile[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isUpdatingFriends, setIsUpdatingFriends] = useState(false);
  const [friendsMessage, setFriendsMessage] = useState<FriendsMessage | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refreshFriends = () => setRefreshToken((currentToken) => currentToken + 1);

  useEffect(() => {
    setInvites([]);
    setFriendships([]);
    setProfiles([]);
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
          const nextProfiles = await loadRemoteFriendPublicProfiles(friendUserIds);
          if (isActive) {
            setProfiles(nextProfiles);
          }
        } catch {
          if (isActive) {
            setProfiles([]);
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

  const profilesByUserId = useMemo(() => new Map(profiles.map((friendProfile) => [friendProfile.userId, friendProfile])), [profiles]);

  const friendItems = useMemo<FriendListItem[]>(() => {
    if (!userId) {
      return [];
    }

    return friendships.map((friendship) => {
      const friendUserId = getOtherUserId(friendship, userId);
      const friendProfile = profilesByUserId.get(friendUserId);

      return {
        ...friendship,
        displayName: friendProfile?.displayName || "Amigo",
        friendUserId,
        profileUpdatedAt: friendProfile?.updatedAt,
      };
    });
  }, [friendships, profilesByUserId, userId]);

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
