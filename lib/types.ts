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
  avatar_url: string | null;
  is_bot: boolean;
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

export type GameType = "quiz" | "dice" | "roulette" | "highlow" | "vote" | "pool";
export type GameStatus = "draft" | "open" | "locked" | "settled" | "cancelled";

export type GameResult = {
  winning_option: number;
  pot: number;
  winner_stake: number;
};

export type Game = {
  id: number;
  type: GameType;
  title: string;
  config: Record<string, unknown>;
  is_open: boolean;
  schedule_id: number | null;
  status: GameStatus;
  result: GameResult | null;
  option_source: "custom" | "players";
  created_at: string;
};

export type BetOption = {
  id: number;
  game_id: number;
  label: string;
  ref_user_id: string | null;
  sort_order: number;
};

export type Bet = {
  id: number;
  game_id: number;
  option_id: number;
  user_id: string;
  amount: number;
  payout: number;
  created_at: string;
};

// 플레이어 화면용: 게임 + 옵션별 팟 + 내 베팅
export type PoolOptionView = BetOption & {
  pot: number;        // 이 선택지에 모인 총액
  my_amount: number;  // 내가 이 선택지에 건 금액
};

export type PoolGameView = Game & {
  schedule_title: string | null;
  options: PoolOptionView[];
  total_pot: number;
  my_total: number;
  my_payout: number;  // 정산 완료 시 내 수령액
};

// 일정 카드에 띄울 게임 배지
export type ScheduleGameBadge = {
  schedule_id: number;
  title: string;
  status: GameStatus;
  winner_label: string | null;
};

// 관리자 운영 화면용
export type AdminGameView = Game & {
  schedule_title: string | null;
  options: (BetOption & { pot: number })[];
  total_pot: number;
  bet_count: number;
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
  avatar_url: string | null;
  team_id: number;
  team_name: string;
  team_color: string;
};

export type DrawStatus = "idle" | "intro" | "revealing" | "done" | "roles";

export type DrawState = {
  id: number;
  status: DrawStatus;
  assignments: DrawAssignment[];
  revealed_count: number;
  updated_at: string;
};

export type AppSettings = {
  id: number;
  is_public: boolean;
  updated_at: string;
};

// ---------- 벌칙 옷 랜덤 뽑기 세리머니 ----------
export type PenaltyOutfit = "banana" | "clown" | "mario" | "party";
export type PenaltyStyle = "race" | "plinko" | "slot";
// lobby: 동물 달리기 대기실(참가자가 선착순 동물 선택 중)
export type PenaltyStatus = "idle" | "lobby" | "running" | "revealed";

export type PenaltyParticipant = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  animal?: string; // 동물 달리기에서 본인이 고른 동물(이모지)
};

// 대기실 슬롯 — 동물 1마리당 1명. user_id=null 이면 미선택.
export type PenaltyLobbySlot = {
  animal: string;
  user_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

// 싱글톤(id=1) — 전원이 Realtime 구독. 당첨자는 서버가 winner_index 로 확정.
export type PenaltyState = {
  id: number;
  status: PenaltyStatus;
  style: PenaltyStyle | null;
  outfit: PenaltyOutfit | null;
  participants: PenaltyParticipant[];
  winner_index: number;
  seed: number;
  slots: number; // 이번 대기실 동물 수
  lobby: PenaltyLobbySlot[]; // 대기실 슬롯(선착순 선택 상태)
  updated_at: string;
};

// 당첨 이력 (penalty_picks) + 표시용 프로필 조인
export type PenaltyPick = {
  id: number;
  user_id: string;
  outfit: PenaltyOutfit;
  style: PenaltyStyle | null;
  created_at: string;
  display_name?: string;
  avatar_url?: string | null;
};

// ---------- 비밀 역할 (스파이 / 광대) ----------
// member(일반) | spy(스파이) | jester(광대). 추후 역할이 추가되면 여기에 값을 늘린다.
export type PlayerRoleKind = "member" | "spy" | "jester";

export type PlayerRole = {
  user_id: string;
  role: PlayerRoleKind;
  revealed: boolean;
};

// ---------- 공개 프로필 (잔액 제외) ----------
// list_public_profiles() RPC 결과 — 남의 gold_balance 는 비공개.
export type PublicProfile = Omit<Profile, "gold_balance">;

// 팀 합산 점수 (team_totals 테이블)
export type TeamTotal = {
  team_id: number;
  total: number;
  updated_at: string;
};

// ---------- 효과카드 / 가챠 ----------
export type EffectGrade = "passive" | "consumable";

export type EffectCardPreset = {
  id: number;
  key: string;
  name: string;
  description: string;
  grade: EffectGrade;
  effect_key: string;
  icon: string;
  weight: number;
};

// 보유 카드 (프리셋 join 포함)
export type PlayerEffectCard = {
  id: number;
  user_id: string;
  preset_id: number;
  acquired_at: string;
  used_at: string | null;
  preset?: EffectCardPreset;
};

// 뽑기 카운터
export type GachaState = {
  user_id: string;
  free_left: number;
  paid_count: number;
};

// draw_effect_card() 반환
export type GachaResult = {
  blank: boolean;
  grade: EffectGrade | null;
  key: string | null;
  name: string | null;
  icon: string | null;
  dup: boolean;
  refund: number;
  cost: number;
  was_free: boolean;
  balance: number;
};

// get_player_stats() / ledger_peek() 반환 (개인 누적)
export type PlayerStats = {
  earned: number;
  spent: number;
  sent: number;
  received: number;
  fee_paid: number;
  gamble_net: number;
  gacha_spent: number;
  tx_count: number;
};

// ---------- 섯다 ----------
export type SutdaStatus = "waiting" | "betting" | "showdown" | "closed";

export type SutdaRoom = {
  id: number;
  name: string;
  created_by: string;
  status: SutdaStatus;
  ante: number;
  pot: number;
  current_bet: number;
  current_turn: string | null;
  turn_deadline: string | null;
  dealer: string | null;
  hand_no: number;
  betting_round: number;
  to_act_remaining: number;
  redeal_used: boolean;
  last_result: SutdaResult | null;
  created_at: string;
  updated_at: string;
};

export type SutdaResult = {
  winners?: string[];
  winner_id?: string;
  pot: number;
  best?: number;
  reason: "fold" | "showdown";
};

export type SutdaPlayer = {
  room_id: number;
  user_id: string;
  seat: number;
  committed: number;
  folded: boolean;
  is_active: boolean;
  in_hand: boolean;
  leave_pending: boolean;
  revealed_card1: number | null;
  revealed_card2: number | null;
  revealed_rank: number | null;
  revealed_label: string | null;
  joined_at: string;
  // 조인해서 채우는 표시용
  display_name?: string;
};

export type SutdaHand = {
  room_id: number;
  hand_no: number;
  user_id: string;
  card1: number;
  card2: number | null;
};

// 로비 목록용
export type SutdaRoomListItem = SutdaRoom & {
  player_count: number;
  joined: boolean;
};
