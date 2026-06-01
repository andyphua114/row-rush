export type Phase =
  | "LOBBY"
  | "BOAT_SELECTION"
  | "ADMIN_REVIEW"
  | "COUNTDOWN"
  | "RACING"
  | "ROUND_RESULTS"
  | "ROUND_LEADERBOARD"
  | "FINAL_RESULTS";

export type BoatSummary = {
  boat_id: string;
  name: string;
  color: string;
  power_name?: string | null;
  power_trait?: string | null;
  rower_count?: number | null;
  position?: number;
  speed?: number;
  rank?: number;
  finish_time?: number | null;
  active_event?: string | null;
  active_event_description?: string | null;
  active_event_kind?: "positive" | "negative" | "mixed" | null;
  progress?: number;
};

export type Contribution = {
  left_taps: number;
  right_taps: number;
  alternating_taps: number;
  repeated_taps: number;
  contribution_power: number;
};

export type PlayerState = {
  type: "player_state";
  room_id?: string;
  room_name?: string;
  max_players?: number;
  phase: Phase;
  round: number;
  time_remaining: number;
  countdown?: string | number | null;
  player_id?: string;
  nickname: string;
  selected_boat?: string | null;
  selected_boat_name?: string | null;
  selected_boat_color?: string | null;
  score: number;
  round_contribution: Contribution;
  last_round_result?: {
    boat_name?: string;
    placement?: number;
    points?: number;
    placement_points?: number;
    accuracy_bonus?: number;
    contribution_bonus?: number;
    accuracy_rate?: number;
    total_score?: number;
    contribution?: Contribution;
  };
  final_rank?: number | null;
  boats: BoatSummary[];
  race_boat?: BoatSummary | null;
  final_leaderboard?: LeaderboardRow[];
};

export type AdminState = {
  type: "admin_state";
  room_id?: string;
  room_name?: string;
  max_players?: number;
  phase: Phase;
  round: number;
  total_players: number;
  connected_players: number;
  boat_capacity: number;
  boat_counts: Record<string, number>;
  boats: BoatSummary[];
  time_remaining: number;
  countdown?: string | number | null;
  round_results: RoundResult[];
  final_leaderboard: LeaderboardRow[];
};

export type RaceState = {
  type: "race_state";
  room_id?: string;
  room_name?: string;
  max_players?: number;
  phase: Phase;
  round: number;
  time_remaining: number;
  countdown?: string | number | null;
  boats: BoatSummary[];
  events: RaceEvent[];
  round_results: RoundResult[];
  final_leaderboard: LeaderboardRow[];
};

export type RaceEvent = {
  boat_id: string;
  boat_name: string;
  name: string;
  description: string;
  kind: "positive" | "negative" | "mixed";
  timestamp: number;
};

export type RoundResult = {
  boat_id: string;
  name: string;
  color: string;
  rank: number;
  position: number;
  finish_time?: number | null;
  rower_count: number;
  power_name: string;
  power_trait: string;
  points: number;
  top_rower?: { nickname: string; power: number } | null;
};

export type LeaderboardRow = {
  player_id: string;
  nickname: string;
  score: number;
  rounds_played: number;
  contribution_power: number;
};

export type CapacityState = {
  max_total_players: number;
  reserved_players: number;
  available_players: number;
  empty_room_ttl_seconds: number;
  final_results_ttl_seconds: number;
};

export type RoomSummary = {
  room_id: string;
  name: string;
  max_players: number;
  total_players: number;
  connected_players: number;
  connected_clients: number;
  phase: Phase;
  round: number;
  created_at: number;
  last_activity_at: number;
  empty_since?: number | null;
  final_results_since?: number | null;
};

export type GlobalAdminState = {
  type: "global_admin_state";
  rooms: RoomSummary[];
  capacity: CapacityState;
};
