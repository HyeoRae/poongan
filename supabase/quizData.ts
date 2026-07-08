/**
 * 🧠 스피드 퀴즈쇼 문제 은행 (서버 전용 — 앱 페이지에서 절대 import 금지!)
 *
 * ⚠ answerIdx(정답)가 여기 들어있으므로 이 파일이 클라이언트 번들에 포함되면
 *   커닝 방지가 무너진다. seedQuiz.ts(시드 스크립트)에서만 import 해서 DB 로 올리고,
 *   앱은 quiz_current() RPC 를 통해서만 문제를 받는다(정답은 공개 시점에만).
 *
 * 출제 방식: 본게임(main) 100문제 중 quiz_begin() RPC 가 매 라운드 10문제를
 *   무작위로 뽑아 quiz_state.round_seqs 에 고정한다(랜덤 셔플). 서든데스(동점자 결승)도
 *   별도 풀 없이, 이 100문제 중 '아직 안 나온' 문제를 quiz_start_tiebreak() 가 무작위로 뽑는다.
 *
 * seq 규칙: 본게임(main)은 1..100. 서든데스도 이 100문제에서 뽑으므로 tiebreak 전용 문제는 두지 않는다.
 * choices 는 2~6개, answerIdx 는 0-based.
 * 주제/난이도: 일반 상식 퀴즈(살짝 어렵게). 지리·음식·동물·인체·생활·속담·스포츠·
 *   세계문화·과학상식·역사·예술·브랜드 등 — 어른 대상 재미 상식(쉬움~중간~어려움 혼합).
 */
export type QuizSeed = {
  seq: number;
  kind: "main" | "tiebreak";
  prompt: string;
  choices: string[];
  answerIdx: number;
};

export const QUIZ_QUESTIONS: QuizSeed[] = [
  // ─────────────────────── 본게임(main) 100문제 ───────────────────────

  // ── 세계 지리·수도·랜드마크 ──
  { seq: 1, kind: "main", prompt: "에펠탑이 있는 도시는?", choices: ["런던", "로마", "베를린", "파리"], answerIdx: 3 },
  { seq: 2, kind: "main", prompt: "자유의 여신상이 있는 미국 도시는?", choices: ["뉴욕", "워싱턴", "보스턴", "시카고"], answerIdx: 0 },
  { seq: 3, kind: "main", prompt: "피라미드와 스핑크스로 유명한 나라는?", choices: ["그리스", "멕시코", "페루", "이집트"], answerIdx: 3 },
  { seq: 4, kind: "main", prompt: "곤돌라가 다니는 '물의 도시'로 불리는 이탈리아 도시는?", choices: ["베네치아", "로마", "밀라노", "나폴리"], answerIdx: 0 },
  { seq: 5, kind: "main", prompt: "세계에서 국토가 가장 작은 나라는?", choices: ["모나코", "산마리노", "리히텐슈타인", "바티칸 시국"], answerIdx: 3 },
  { seq: 6, kind: "main", prompt: "다음 중 오로라(북극광)를 보기 가장 어려운 곳은?", choices: ["적도 부근", "북유럽", "알래스카", "캐나다 북부"], answerIdx: 0 },
  { seq: 7, kind: "main", prompt: "하얀 대리석 궁전 '타지마할'이 있는 나라는?", choices: ["파키스탄", "네팔", "이란", "인도"], answerIdx: 3 },
  { seq: 8, kind: "main", prompt: "거대한 사원 유적 '앙코르 와트'가 있는 나라는?", choices: ["캄보디아", "태국", "베트남", "라오스"], answerIdx: 0 },
  { seq: 9, kind: "main", prompt: "아프리카 북부에 있는, 세계에서 가장 넓은 '더운 사막'은?", choices: ["고비 사막", "칼라하리 사막", "아타카마 사막", "사하라 사막"], answerIdx: 3 },
  { seq: 10, kind: "main", prompt: "나이아가라 폭포가 걸쳐 있는 두 나라는?", choices: ["미국·캐나다", "미국·멕시코", "브라질·아르헨티나", "중국·러시아"], answerIdx: 0 },

  // ── 한국 지리·명소·여행 ──
  { seq: 11, kind: "main", prompt: "해운대 해수욕장이 있는 도시는?", choices: ["인천", "울산", "부산", "포항"], answerIdx: 2 },
  { seq: 12, kind: "main", prompt: "남한에서 가장 높은 산은?", choices: ["백두산", "지리산", "설악산", "한라산"], answerIdx: 3 },
  { seq: 13, kind: "main", prompt: "첨성대와 불국사가 있는, 신라의 옛 수도는?", choices: ["경주", "부여", "공주", "김해"], answerIdx: 0 },
  { seq: 14, kind: "main", prompt: "한산도 대첩이 벌어진 앞바다로 유명한, 이번 여행지 도시는?", choices: ["여수", "통영", "목포", "거제"], answerIdx: 1 },
  { seq: 15, kind: "main", prompt: "제주도의 상징인 '돌하르방'은 원래 무엇을 뜻하는 말인가?", choices: ["돌 대문", "돌 무덤", "돌 할아버지", "돌 등대"], answerIdx: 2 },
  { seq: 16, kind: "main", prompt: "서울 4대문 중 남쪽 대문으로, 흔히 '남대문'이라 불리는 것은?", choices: ["흥인지문", "돈의문", "숙정문", "숭례문"], answerIdx: 3 },
  { seq: 17, kind: "main", prompt: "대한민국 5만 원권 지폐에 그려진 인물은?", choices: ["신사임당", "세종대왕", "이순신", "이황"], answerIdx: 0 },
  { seq: 18, kind: "main", prompt: "1988년 서울에서 열린 국제 스포츠 대회는?", choices: ["아시안게임", "서울 올림픽", "월드컵", "유니버시아드"], answerIdx: 1 },

  // ── 음식·요리 ──
  { seq: 19, kind: "main", prompt: "김치의 매운맛과 붉은색을 내는 주재료는?", choices: ["된장", "간장", "고춧가루", "식초"], answerIdx: 2 },
  { seq: 20, kind: "main", prompt: "도우에 토마토소스와 치즈를 얹어 화덕에 구운 이탈리아 음식은?", choices: ["파스타", "리조토", "라자냐", "피자"], answerIdx: 3 },
  { seq: 21, kind: "main", prompt: "식초로 간한 밥 위에 생선을 올린 일본의 대표 음식은?", choices: ["초밥", "라멘", "우동", "덴푸라"], answerIdx: 0 },
  { seq: 22, kind: "main", prompt: "삼계탕에 흔히 넣는, 붉게 말린 열매 약재는?", choices: ["은행", "대추", "밤", "호두"], answerIdx: 1 },
  { seq: 23, kind: "main", prompt: "김밥을 쌀 때 밥과 재료를 감싸는 검은 재료는?", choices: ["미역", "다시마", "김", "깻잎"], answerIdx: 2 },
  { seq: 24, kind: "main", prompt: "옥수수 전병에 고기와 채소를 싸 먹는 멕시코 음식은?", choices: ["케밥", "스시", "딤섬", "타코"], answerIdx: 3 },
  { seq: 25, kind: "main", prompt: "프랑스의 대표적인 달팽이 요리를 무엇이라 하는가?", choices: ["에스카르고", "푸아그라", "라따뚜이", "크루아상"], answerIdx: 0 },
  { seq: 26, kind: "main", prompt: "된장과 간장을 만드는 데 공통으로 쓰이는 주재료는?", choices: ["쌀", "콩", "보리", "밀"], answerIdx: 1 },
  { seq: 27, kind: "main", prompt: "커피의 원료가 되는 것은?", choices: ["찻잎", "카카오 열매", "커피나무 열매", "보리"], answerIdx: 2 },

  // ── 동물·자연 ──
  { seq: 28, kind: "main", prompt: "육지에 사는 동물 중 몸집이 가장 큰 것은?", choices: ["기린", "하마", "코뿔소", "코끼리"], answerIdx: 3 },
  { seq: 29, kind: "main", prompt: "지구상에 사는 동물 중 가장 큰 것은?", choices: ["흰긴수염고래", "아프리카코끼리", "향유고래", "기린"], answerIdx: 0 },
  { seq: 30, kind: "main", prompt: "코알라가 주로 먹고 사는 나뭇잎은?", choices: ["대나무", "유칼립투스", "떡갈나무", "소나무"], answerIdx: 1 },
  { seq: 31, kind: "main", prompt: "판다가 주로 먹는 먹이는?", choices: ["유칼립투스", "바나나", "대나무", "물고기"], answerIdx: 2 },
  { seq: 32, kind: "main", prompt: "포유류이면서도 알을 낳는 것으로 유명한 동물은?", choices: ["박쥐", "돌고래", "캥거루", "오리너구리"], answerIdx: 3 },
  { seq: 33, kind: "main", prompt: "벌 무리에서 꿀을 모으며 일을 도맡는 벌은?", choices: ["일벌", "여왕벌", "수벌", "말벌"], answerIdx: 0 },
  { seq: 34, kind: "main", prompt: "개구리·두꺼비처럼 물과 뭍을 오가며 사는 동물 무리는?", choices: ["파충류", "양서류", "포유류", "조류"], answerIdx: 1 },
  { seq: 35, kind: "main", prompt: "낙타의 등에 있는 혹에 주로 저장되는 것은?", choices: ["물", "공기", "지방", "근육"], answerIdx: 2 },
  { seq: 36, kind: "main", prompt: "달리기 속도가 가장 빠른 육상 동물은?", choices: ["사자", "말", "캥거루", "치타"], answerIdx: 3 },

  // ── 인체·건강 상식 ──
  { seq: 37, kind: "main", prompt: "성인의 몸에는 뼈가 대략 몇 개 있는가?", choices: ["약 106개", "약 206개", "약 306개", "약 406개"], answerIdx: 1 },
  { seq: 38, kind: "main", prompt: "몸의 균형(평형감각)을 담당하는 기관이 함께 들어 있는 곳은?", choices: ["귀", "눈", "코", "피부"], answerIdx: 0 },
  { seq: 39, kind: "main", prompt: "음식을 소화할 때 위에서 나오는 강한 산성 물질은?", choices: ["침", "위산", "쓸개즙", "인슐린"], answerIdx: 1 },
  { seq: 40, kind: "main", prompt: "피를 붉게 만드는 색소인 헤모글로빈에 들어 있는 금속 성분은?", choices: ["구리", "칼슘", "철", "나트륨"], answerIdx: 2 },
  { seq: 41, kind: "main", prompt: "성인의 하루 권장 수면 시간은 보통 몇 시간인가?", choices: ["3~4시간", "5~6시간", "7~8시간", "10~11시간"], answerIdx: 2 },
  { seq: 42, kind: "main", prompt: "몸의 겉면 전체를 덮고 있는, 사람의 가장 큰 기관은?", choices: ["간", "폐", "심장", "피부"], answerIdx: 3 },
  { seq: 43, kind: "main", prompt: "치아의 가장 바깥을 덮은, 인체에서 가장 단단한 조직은?", choices: ["법랑질", "상아질", "잇몸", "치수"], answerIdx: 0 },

  // ── 생활·잡학 상식 ──
  { seq: 44, kind: "main", prompt: "대한민국에서 불이 났을 때 신고하는 전화번호는?", choices: ["112", "119", "114", "120"], answerIdx: 1 },
  { seq: 45, kind: "main", prompt: "대한민국에서 범죄를 신고할 때 거는 경찰 전화번호는?", choices: ["112", "119", "114", "118"], answerIdx: 0 },
  { seq: 46, kind: "main", prompt: "세로형 신호등에서 맨 위에 있는 색은?", choices: ["노랑", "빨강", "초록", "파랑"], answerIdx: 1 },
  { seq: 47, kind: "main", prompt: "무지개를 그릴 때 가장 바깥쪽(위)에 오는 색은?", choices: ["노랑", "초록", "빨강", "보라"], answerIdx: 2 },
  { seq: 48, kind: "main", prompt: "모국어로 쓰는 사람이 세계에서 가장 많은 언어는?", choices: ["영어", "스페인어", "힌디어", "중국어"], answerIdx: 3 },
  { seq: 49, kind: "main", prompt: "1년 열두 달 중 날수가 가장 적은 달은?", choices: ["1월", "2월", "4월", "11월"], answerIdx: 1 },
  { seq: 50, kind: "main", prompt: "시계의 짧은바늘(시침)은 하루에 시계를 몇 바퀴 도는가?", choices: ["1바퀴", "2바퀴", "12바퀴", "24바퀴"], answerIdx: 1 },
  { seq: 51, kind: "main", prompt: "올림픽을 상징하는 오륜기의 고리는 모두 몇 개인가?", choices: ["3개", "4개", "5개", "6개"], answerIdx: 2 },
  { seq: 52, kind: "main", prompt: "트럼프(플레잉 카드) 한 벌은 조커를 빼면 모두 몇 장인가?", choices: ["48장", "52장", "54장", "56장"], answerIdx: 1 },

  // ── 속담·사자성어·우리말 ──
  { seq: 53, kind: "main", prompt: "'천 리 길도 ○부터' — 빈칸에 들어갈 말은?", choices: ["한 걸음", "첫날", "지도", "신발"], answerIdx: 0 },
  { seq: 54, kind: "main", prompt: "'○○ 도둑이 소도둑 된다' — 빈칸에 알맞은 것은?", choices: ["동전", "바늘", "쌀", "닭"], answerIdx: 1 },
  { seq: 55, kind: "main", prompt: "사자성어 '일석이조(一石二鳥)'와 뜻이 가장 가까운 속담은?", choices: ["벼룩의 간을 빼먹다", "티끌 모아 태산", "꿩 먹고 알 먹고", "우물 안 개구리"], answerIdx: 2 },
  { seq: 56, kind: "main", prompt: "'고생 끝에 ○이 온다' — 빈칸에 들어갈 말은?", choices: ["복", "별", "돈", "낙"], answerIdx: 3 },
  { seq: 57, kind: "main", prompt: "사자성어 '유비무환(有備無患)'이 강조하는 것은?", choices: ["미리 준비함", "빨리 포기함", "크게 성냄", "깊이 잠듦"], answerIdx: 0 },
  { seq: 58, kind: "main", prompt: "'가는 말이 고와야 오는 말이 곱다'가 강조하는 것은?", choices: ["빨리 달리기", "말을 곱게 하기", "돈을 아끼기", "일찍 일어나기"], answerIdx: 1 },
  { seq: 59, kind: "main", prompt: "'남의 떡이 더 ○○ 보인다' — 빈칸에 알맞은 말은?", choices: ["작아", "비싸", "커", "맛없어"], answerIdx: 2 },
  { seq: 60, kind: "main", prompt: "사자성어 '금상첨화(錦上添花)'의 뜻은?", choices: ["엎친 데 덮친 격", "제자리걸음", "헛수고", "좋은 일에 좋은 일이 더해짐"], answerIdx: 3 },

  // ── 스포츠 ──
  { seq: 61, kind: "main", prompt: "축구에서 경기 중 손을 쓸 수 있는 유일한 선수는?", choices: ["골키퍼", "공격수", "수비수", "심판"], answerIdx: 0 },
  { seq: 62, kind: "main", prompt: "야구에서 타자가 한 번에 홈까지 돌아오는 안타를 무엇이라 하는가?", choices: ["안타", "2루타", "홈런", "번트"], answerIdx: 2 },
  { seq: 63, kind: "main", prompt: "골프에서 기준 타수(파)보다 1타 적게 홀에 넣는 것은?", choices: ["보기", "버디", "파", "이글"], answerIdx: 1 },
  { seq: 64, kind: "main", prompt: "발차기를 주 무기로 하는 대한민국의 국기(國技) 무술은?", choices: ["유도", "복싱", "태권도", "레슬링"], answerIdx: 2 },
  { seq: 65, kind: "main", prompt: "국제축구연맹(FIFA) 월드컵은 몇 년마다 열리는가?", choices: ["1년", "2년", "4년", "5년"], answerIdx: 2 },
  { seq: 66, kind: "main", prompt: "농구에서 골대에 공을 위에서 내리꽂는 화려한 득점은?", choices: ["레이업", "덩크슛", "자유투", "3점슛"], answerIdx: 1 },
  { seq: 67, kind: "main", prompt: "마라톤의 정식 경기 거리는 약 몇 km인가?", choices: ["약 21km", "약 30km", "약 42km", "약 50km"], answerIdx: 2 },

  // ── 세계 문화·국기·화폐 ──
  { seq: 68, kind: "main", prompt: "미국에서 쓰는 화폐 단위는?", choices: ["유로", "파운드", "엔", "달러"], answerIdx: 3 },
  { seq: 69, kind: "main", prompt: "일본에서 쓰는 화폐 단위는?", choices: ["엔", "원", "위안", "바트"], answerIdx: 0 },
  { seq: 70, kind: "main", prompt: "유럽 여러 나라가 함께 쓰는 공통 화폐는?", choices: ["달러", "유로", "프랑", "마르크"], answerIdx: 1 },
  { seq: 71, kind: "main", prompt: "태극기 한가운데의 태극 문양이 상징하는 것은?", choices: ["해와 달", "하늘과 땅", "음과 양", "불과 물"], answerIdx: 2 },
  { seq: 72, kind: "main", prompt: "설날에 어른께 큰절(세배)을 올린 뒤 흔히 받는 것은?", choices: ["용돈", "월급", "상금", "세뱃돈"], answerIdx: 3 },
  { seq: 73, kind: "main", prompt: "크리스마스에 아이들에게 선물을 준다고 알려진 인물은?", choices: ["산타클로스", "큐피드", "루돌프", "스크루지"], answerIdx: 0 },
  { seq: 74, kind: "main", prompt: "인도에서 소를 신성하게 여겨 함부로 잡지 않는 것과 관련된 종교는?", choices: ["불교", "힌두교", "이슬람교", "기독교"], answerIdx: 1 },

  // ── 우주·과학 상식 ──
  { seq: 75, kind: "main", prompt: "태양처럼 스스로 빛과 열을 내는 별을 통틀어 무엇이라 하는가?", choices: ["행성", "위성", "항성", "혜성"], answerIdx: 2 },
  { seq: 76, kind: "main", prompt: "지구에서 가장 가까운 별(항성)은?", choices: ["달", "북극성", "시리우스", "태양"], answerIdx: 3 },
  { seq: 77, kind: "main", prompt: "우주 공간에서 사람이 숨을 쉴 수 없는 이유는?", choices: ["공기가 없어서", "너무 밝아서", "소리가 커서", "중력이 세서"], answerIdx: 0 },
  { seq: 78, kind: "main", prompt: "저녁노을이 붉게 보이는 것은 주로 무엇 때문인가?", choices: ["소리의 반사", "빛의 산란", "지구 자전 속도", "달의 그림자"], answerIdx: 1 },
  { seq: 79, kind: "main", prompt: "물이 얼어 얼음이 되면 부피는 어떻게 되는가?", choices: ["줄어든다", "변화 없다", "늘어난다", "사라진다"], answerIdx: 2 },
  { seq: 80, kind: "main", prompt: "번개가 친 뒤 천둥소리가 늦게 들리는 이유는?", choices: ["소리가 빛보다 빨라서", "둘의 속도가 같아서", "바람 때문에", "빛이 소리보다 빨라서"], answerIdx: 3 },
  { seq: 81, kind: "main", prompt: "나침반의 바늘이 항상 가리키는 방향은?", choices: ["남과 북", "동과 서", "위와 아래", "해가 뜨는 곳"], answerIdx: 0 },
  { seq: 82, kind: "main", prompt: "달이 밤마다 모양이 달라 보이는 현상을 무엇이라 하는가?", choices: ["일식", "달의 위상 변화", "월식", "유성우"], answerIdx: 1 },

  // ── 역사 상식 ──
  { seq: 83, kind: "main", prompt: "한글을 만든 조선의 임금은?", choices: ["정조", "광개토대왕", "세종대왕", "태종"], answerIdx: 2 },
  { seq: 84, kind: "main", prompt: "거북선을 이끌고 임진왜란에서 활약한 장군은?", choices: ["강감찬", "을지문덕", "권율", "이순신"], answerIdx: 3 },
  { seq: 85, kind: "main", prompt: "세계 최초로 달에 발을 디딘 사람은?", choices: ["닐 암스트롱", "유리 가가린", "버즈 올드린", "존 글렌"], answerIdx: 0 },
  { seq: 86, kind: "main", prompt: "전구를 실용화한 것으로 널리 알려진 발명가는?", choices: ["뉴턴", "에디슨", "아인슈타인", "벨"], answerIdx: 1 },
  { seq: 87, kind: "main", prompt: "전화기를 발명한 것으로 널리 알려진 인물은?", choices: ["에디슨", "라이트 형제", "벨", "와트"], answerIdx: 2 },
  { seq: 88, kind: "main", prompt: "프랑스가 미국에 선물해 뉴욕에 세워진 조형물은?", choices: ["에펠탑", "개선문", "피사의 사탑", "자유의 여신상"], answerIdx: 3 },
  { seq: 89, kind: "main", prompt: "조선을 세운 첫 번째 임금(태조)은?", choices: ["이성계", "왕건", "김유신", "궁예"], answerIdx: 0 },

  // ── 예술·음악·영화 ──
  { seq: 90, kind: "main", prompt: "해바라기를 즐겨 그렸고, 자신의 귀를 자른 일화로 유명한 화가는?", choices: ["피카소", "고흐", "모네", "다빈치"], answerIdx: 1 },
  { seq: 91, kind: "main", prompt: "「모나리자」를 그린 화가는?", choices: ["고흐", "라파엘로", "레오나르도 다빈치", "렘브란트"], answerIdx: 2 },
  { seq: 92, kind: "main", prompt: "오케스트라 앞에서 지휘봉을 들고 연주를 이끄는 사람은?", choices: ["연주자", "작곡가", "성악가", "지휘자"], answerIdx: 3 },
  { seq: 93, kind: "main", prompt: "피아노는 연주할 때 무엇을 눌러 소리를 내는 악기인가?", choices: ["건반을 누른다", "줄을 활로 켠다", "입으로 분다", "막대로 친다"], answerIdx: 0 },
  { seq: 94, kind: "main", prompt: "「호두까기 인형」, 「백조의 호수」로 유명한 무대 예술 장르는?", choices: ["오페라", "발레", "뮤지컬", "연극"], answerIdx: 1 },
  { seq: 95, kind: "main", prompt: "'미키 마우스'를 만든 것으로 유명한 미국 회사는?", choices: ["픽사", "드림웍스", "디즈니", "지브리"], answerIdx: 2 },

  // ── 브랜드·기업·로고 ──
  { seq: 96, kind: "main", prompt: "'한 입 베어 문 사과' 로고로 유명한 미국 IT 기업은?", choices: ["삼성", "구글", "마이크로소프트", "애플"], answerIdx: 3 },
  { seq: 97, kind: "main", prompt: "'인터넷에서 ○○해봐'라는 말로도 쓰이는, 검색으로 유명한 미국 기업은?", choices: ["구글", "야후", "네이버", "빙"], answerIdx: 0 },
  { seq: 98, kind: "main", prompt: "노란색 아치(M) 로고로 유명한 세계적인 햄버거 브랜드는?", choices: ["버거킹", "맥도날드", "KFC", "롯데리아"], answerIdx: 1 },
  { seq: 99, kind: "main", prompt: "갤럭시 스마트폰을 만드는 대한민국 전자 기업은?", choices: ["LG", "현대", "삼성", "SK"], answerIdx: 2 },
  { seq: 100, kind: "main", prompt: "초록색 원형 로고(세이렌)로 유명한 미국의 커피 전문점 브랜드는?", choices: ["이디야", "할리스", "커피빈", "스타벅스"], answerIdx: 3 },

  // 서든데스(동점자 결승)는 별도 풀 없이, 위 100문제 중 '아직 안 나온' 문제를
  // quiz_start_tiebreak() RPC 가 무작위로 뽑아 낸다(round_seqs 로 중복 제외).
];
