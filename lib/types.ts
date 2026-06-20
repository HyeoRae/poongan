import type { Role, TxType } from "./constants";

export type Team = {
  id: number;
  name: string;
  color: string;
};

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  team_id: number | null;
  gold_balance: number;
  must_change_password: boolean;
  created_at: string;
};

export type Transaction = {
  id: number;
  user_id: string | null;
  team_id: number | null;
  amount: number;
  type: TxType;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

export type ScheduleItem = {
  id: number;
  day: number;
  start_time: string | null;
  title: string;
  description: string | null;
  location: string | null;
  sort_order: number;
};

export type Game = {
  id: number;
  type: "quiz" | "dice" | "roulette" | "highlow" | "vote";
  title: string;
  config: Record<string, unknown>;
  is_open: boolean;
  created_at: string;
};

// 대시보드 표시용: 팀 + 소속 멤버
export type TeamWithMembers = Team & {
  members: Pick<Profile, "id" | "display_name" | "gold_balance">[];
  total_gold: number;
};

// 팀 배정식(드로우 쇼)
export type DrawAssignment = {
  user_id: string;
  display_name: string;
  team_id: number;
  team_name: string;
  team_color: string;
};

export type DrawStatus = "idle" | "intro" | "revealing" | "done";

export type DrawState = {
  id: number;
  status: DrawStatus;
  assignments: DrawAssignment[];
  revealed_count: number;
  updated_at: string;
};
