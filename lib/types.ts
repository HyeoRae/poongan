import type { Role, TxType } from "./constants";
import type { PENALTY_OUTFITS, PENALTY_STYLES } from "./constants";

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
  house_tax_on: boolean;
  house_tax_base: number;
  house_tax_rich: number;
  updated_at: string;
};

// 공동 잭팟풀(jackpot_pool 싱글턴) — 도박 하우스세·세무조사로 모인 재분배 대기 토큰
export type JackpotPool = {
  id: number;
  amount: number;
  updated_at: string;
};

// ---------- 🛎️ 공용 이벤트 대기실 (실시간 접속 현황) ----------
export type EventLobbyStatus = "closed" | "open";

// 싱글톤(id=1) — 전원이 Realtime 구독. 열림/닫힘 상태만 동기화.
export type EventLobby = {
  id: number;
  status: EventLobbyStatus;
  title: string | null;
  activity: "quiz" | null; // 다음 활동 신호 — 'quiz'면 전원 /quiz 로 이동. null=대기.
  updated_at: string;
};

// 대기실 Presence — "지금 접속(시청) 중인 사람".
// DB 가 아니라 Realtime Presence 채널로 오가는 휘발성 데이터.
export type LobbyPresence = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: boolean;
};

// 🛎️ 대기실 "입장자" — 명시적으로 입장(join)한 사람. durable(event_lobby_members).
// 퀴즈 시작 시 이 명단이 곧 참가자·최저점·벌칙 후보가 된다.
export type LobbyMember = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: boolean;
  joined_at?: string;
};

// ---------- 벌칙 옷 랜덤 뽑기 세리머니 ----------
// 키셋은 constants.ts 의 PENALTY_OUTFITS/STYLES 에서 파생(단일 소스). 옷/연출 추가 시 constants 만 고치면 된다.
export type PenaltyOutfit = keyof typeof PENALTY_OUTFITS;
export type PenaltyStyle = keyof typeof PENALTY_STYLES;
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

// person: 사람 랜덤(기존 뽑기) | outfit: 사람 고정 + 옷 랜덤(퀴즈 최저점자 벌칙 옷 파칭코)
export type PenaltyMode = "person" | "outfit";

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
  mode: PenaltyMode; // 'outfit' 이면 participants=옷 레인, target_user=옷 입을 사람
  target_user: PenaltyParticipant | null; // outfit 모드 고정 대상
  updated_at: string;
};

// 당첨 이력 (penalty_picks) + 표시용 프로필 조인
export type PenaltyPick = {
  id: number;
  user_id: string;
  outfit: PenaltyOutfit;
  style: PenaltyStyle | null;
  created_at: string;
  expires_at: string | null; // 착용 만료(당첨 + 3시간). 과거 이력은 null.
  display_name?: string;
  avatar_url?: string | null;
};

// ---------- 비밀 역할 ----------
// member(일반) | spy(스파이) | jester(광대) | thief(도둑) | hacker(해커) | leader(팀장).
export type PlayerRoleKind =
  | "member"
  | "spy"
  | "jester"
  | "thief"
  | "hacker"
  | "leader";

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
  last_action: string | null;
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

// ---------- 🧠 실시간 스피드 퀴즈쇼 ----------
export type QuizStatus = "idle" | "question" | "reveal" | "finished";
export type QuizPhase = "main" | "tiebreak";

// 문제별 채점 상세(quiz_reveal main 스냅샷)
export type QuizAnswerResult = {
  user_id: string;
  choice: number;
  correct: boolean;
  rank: number | null; // 정답자 속도 순번(1,2,3…)
  score: number;
};

// quiz_reveal / quiz_finish 이 last_result 에 남기는 스냅샷 (phase 로 분기)
export type QuizResult =
  | { phase: "main"; seq: number; answer_idx: number; answers: QuizAnswerResult[] }
  | { phase: "tiebreak"; seq: number; answer_idx: number; survivors: string[]; participants: string[] }
  | { phase: "finish_tie"; needs_tiebreak: true; tied: string[]; min: number }
  | {
      phase: "finished";
      loser: string;
      ranking: { user_id: string; total: number; correct_count: number }[];
    };

// 싱글톤(id=1) — 전원이 Realtime 구독. 상태머신 전체를 한 행에.
export type QuizState = {
  id: number;
  status: QuizStatus;
  phase: QuizPhase;
  current_seq: number | null;
  question_started_at: string | null; // 문제 오픈 서버시각(=트리거+3초). 3·2·1 기준점
  question_deadline: string | null; // started_at + 30초
  round_seqs: number[] | null; // 이번 라운드에 뽑힌 본게임 문제 순서(100문제 중 랜덤 10). idle이면 null
  tiebreak_user_ids: string[] | null;
  last_result: QuizResult | null;
  updated_at: string;
};

// quiz_current() 반환 — question 중엔 answer_idx 없음(정답 격리), reveal 후에만 포함.
export type QuizQuestionPublic = {
  seq: number;
  kind: "main" | "tiebreak";
  prompt: string;
  choices: string[];
  answer_idx?: number;
};

// 누적 점수표 (quiz_scores)
export type QuizScore = {
  user_id: string;
  total: number;
  correct_count: number;
  updated_at: string;
};
