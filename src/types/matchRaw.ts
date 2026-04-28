export type WinnerCode = "white" | "black" | "draw" | "w" | "b" | "d" | string;
export type PlayerRef = string | number;
export type RawDbCompactGame = string;

export type GameSourceMetadata = {
  source?: string | null | undefined;
  match_source?: string | null | undefined;
  queue?: string | null | undefined;
};

export type RatingFields = {
  before_rating: number | null;
  after_rating: number | null;
  before_rd: number | null;
  after_rd: number | null;
};

export type RawRatingsByPlayer = Record<string, RatingFields>;

export type RawCompactGameTuple = [
  id?: string | number,
  white?: PlayerRef | null,
  black?: PlayerRef | null,
  winner?: WinnerCode | null,
];

export type RawGameObject = GameSourceMetadata & {
  id?: string | number;
  white?: PlayerRef | null;
  black?: PlayerRef | null;
  winner?: WinnerCode | null;
};

export type RawCompactRatingTuple = [
  player?: PlayerRef | null,
  beforeRating?: number | null,
  afterRating?: number | null,
  beforeRd?: number | null,
  afterRd?: number | null,
];

export type RawMatchLike = GameSourceMetadata & {
  match_id?: string | null;
  start_ts?: number | string | null;
  s?: number | string | null;
  time_control?: string | null;
  t?: string | null;
  players?: string[] | null;
  p?: string[] | null;
  games?: Array<RawCompactGameTuple | RawGameObject> | null;
  g?: Array<RawCompactGameTuple | RawGameObject> | null;
  ratings?: RawRatingsByPlayer | null;
  ra?: RawRatingsByPlayer | null;
  ratings_compact?: RawCompactRatingTuple[] | null;
  u?: RawCompactRatingTuple[] | null;
};

export type RawMatchSourceFields = Pick<RawMatchLike, "source" | "match_source" | "queue">;
