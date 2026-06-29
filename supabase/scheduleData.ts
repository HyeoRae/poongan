/**
 * 여행 일정 단일 소스 — docs/schedule.md 기준.
 * seed.ts(신규 DB 삽입)와 seedSchedule.ts(기존 DB 덮어쓰기)가 공유한다.
 * 시간은 "예상 시각 참고만"이라 시작시각만 표기한다.
 */
type ScheduleSeed = {
  day: number;
  start_time: string;
  title: string;
  location?: string;
  description?: string;
  sort_order: number;
};

export const SCHEDULE_ITEMS: ScheduleSeed[] = [
  // 1일차 (7/10)
  { day: 1, start_time: "08:00", title: "부산역 집합 & 차량 렌트, 거제 출발", location: "부산역", description: "스타리아 한 대에 타는지는 미정", sort_order: 1 },
  { day: 1, start_time: "11:00", title: "거제로 출발", location: "거제", sort_order: 2 },
  { day: 1, start_time: "13:00", title: "점심 식사", sort_order: 3 },
  { day: 1, start_time: "14:00", title: "거제 특별 액티비티", location: "거제", sort_order: 4 },
  { day: 1, start_time: "17:00", title: "숙소 도착 & 휴식", location: "거제 숙소", sort_order: 5 },
  { day: 1, start_time: "18:00", title: "🍖 저녁 식사 — 바베큐 파티", sort_order: 6 },
  { day: 1, start_time: "20:00", title: "저녁 식사 정리 & 숙소 내부 이동", sort_order: 7 },
  { day: 1, start_time: "20:20", title: "저녁 컨텐츠 및 2차", sort_order: 8 },

  // 2일차 (7/11)
  { day: 2, start_time: "07:00", title: "기상 & 선상낚시 장소로 이동", sort_order: 1 },
  { day: 2, start_time: "08:30", title: "🎣 선상 낚시", description: "선상라면", sort_order: 2 },
  { day: 2, start_time: "12:00", title: "점심 식사 — 낚시한 물고기", sort_order: 3 },
  { day: 2, start_time: "13:00", title: "사우나 & 샤워", sort_order: 4 },
  { day: 2, start_time: "14:00", title: "통영 이동 (스카이라인)", location: "통영", sort_order: 5 },
  { day: 2, start_time: "15:00", title: "🛷 루지 3회 이용", location: "통영", sort_order: 6 },
  { day: 2, start_time: "16:30", title: "🚠 해상 케이블카 (관광)", location: "통영", sort_order: 7 },
  { day: 2, start_time: "17:00", title: "다찌집 이동", location: "통영", sort_order: 8 },
  { day: 2, start_time: "18:00", title: "저녁 식사", sort_order: 9 },
  { day: 2, start_time: "20:00", title: "2차", sort_order: 10 },
  { day: 2, start_time: "23:00", title: "숙소 이동 & 취침 준비", sort_order: 11 },

  // 3일차 (7/12)
  { day: 3, start_time: "~11:00", title: "기상 & 외출 준비", description: "해장라면", sort_order: 1 },
  { day: 3, start_time: "11:00", title: "근처 카페로 이동", sort_order: 2 },
  { day: 3, start_time: "12:30", title: "부산 이동", location: "부산", sort_order: 3 },
  { day: 3, start_time: "14:30", title: "각자 귀가", sort_order: 4 },
];
