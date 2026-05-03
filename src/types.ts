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
