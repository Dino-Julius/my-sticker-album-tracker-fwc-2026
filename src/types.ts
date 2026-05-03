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

export type TradeRecord = {
  id: string;
  createdAt: string;
  tradedWith?: string;
  notes?: string;
  gave: TradeItem[];
  received: TradeItem[];
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
