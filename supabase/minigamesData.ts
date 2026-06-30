/**
 * 미니게임 프리셋 — 핵심 일정에 미리 깔아둘 팟배팅 게임.
 * seedMinigames.ts(npm run seed:games)가 사용한다.
 *
 * 선택지(참가자 명단)는 여기서 넣지 않는다. 관리자가 현장에서 게임을 "오픈"할 때
 * 그 시점의 player 명단으로 자동 생성되므로 인원 변동에 안전하다.
 */
export type MinigameSeed = {
  title: string;
  scheduleKeyword: string; // schedule.title 에 포함된 키워드로 연결 일정 매칭
  option_source: "players" | "custom";
  description?: string;
};

export const MINIGAME_PRESETS: MinigameSeed[] = [
  {
    title: "🎣 강태공 배팅",
    scheduleKeyword: "낚시",
    option_source: "players",
    description: "오늘 제일 많이 낚는 강태공은 누구?",
  },
  {
    title: "🛷 루지1등 배팅",
    scheduleKeyword: "루지",
    option_source: "players",
    description: "루지 레이스 1등으로 내려오는 사람은?",
  },
];
