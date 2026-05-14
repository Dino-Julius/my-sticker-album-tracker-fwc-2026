export type StickerStatus = "missing" | "owned" | "repeated";
export type CollectionType = "special" | "team" | "sponsor";

export type Sticker = {
  code: string;
  country: string;
  group: string;
  section: string;
  number: number | string;
  displayName?: string;
};

export type Progress = Record<string, number>;

export type TradeItem = {
  code: string;
  quantity: number;
};

export type TradeSettlement =
  | { type: "stickers" }
  | { type: "money"; amount: number; currency: string }
  | { type: "gift" };

export type TradeRecord = {
  id: string;
  createdAt: string;
  tradedWith?: string;
  notes?: string;
  gave: TradeItem[];
  received: TradeItem[];
  settlement?: TradeSettlement;
};

export type PendingTradeRecord = TradeRecord & {
  reservedAt: string;
};

export type RegistrationEventSource = "manual" | "bulk" | "import" | "reset" | "collection";
export type RegistrationEventAction = "increment" | "set-owned" | "set-missing" | "set-quantity" | "import" | "reset";

export type RegistrationEventItem = {
  code: string;
  before: number;
  after: number;
  delta: number;
};

export type RegistrationEvent = {
  id: string;
  createdAt: string;
  source: RegistrationEventSource;
  action: RegistrationEventAction;
  items: RegistrationEventItem[];
  note?: string;
};

export type UserProfile = {
  userId: string;
  email?: string;
  fullName?: string;
  nickname?: string;
  updatedAt?: string;
};

export type FriendInviteStatus = "active" | "used" | "expired" | "revoked";

export type FriendInvite = {
  id: string;
  code: string;
  createdByUserId: string;
  createdAt: string;
  expiresAt: string;
  usedByUserId?: string;
  usedAt?: string;
  status: FriendInviteStatus;
};

export type FriendshipStatus = "pending" | "accepted" | "rejected" | "removed" | "blocked";

export type Friendship = {
  id: string;
  requesterUserId: string;
  receiverUserId: string;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
};

export type FriendPublicProfile = {
  userId: string;
  displayName: string;
  updatedAt: string;
};

export type FriendExchangeSnapshot = {
  userId: string;
  displayName: string;
  completionPercentage: number;
  ownedCount: number;
  missingCount: number;
  repeatedCount: number;
  extrasCount: number;
  missingCodes: string[];
  extras: Record<string, number>;
  updatedAt: string;
};

export type SyncIssueArea = "progress" | "trades" | "registration-events" | "pending-trades" | "profile";
export type SyncIssueOperation = "load" | "save" | "delete";

export type SyncIssue = {
  id: string;
  area: SyncIssueArea;
  operation: SyncIssueOperation;
  message: string;
  createdAt: string;
};

export type Filters = {
  query: string;
  country: string;
  group: string;
  section: string;
  status: "all" | StickerStatus;
};

export type CountryStats = {
  country: string;
  total: number;
  owned: number;
  missing: number;
  repeated: number;
  repeatedExtras: number;
  completionPercentage: number;
};

export type CollectionStats = {
  name: string;
  type: CollectionType;
  total: number;
  owned: number;
  missing: number;
  repeated: number;
  repeatedExtras: number;
  completionPercentage: number;
};

export type AlbumGroupStats = {
  name: string;
  total: number;
  owned: number;
  missing: number;
  repeatedExtras: number;
  completionPercentage: number;
  collections: CollectionStats[];
};
