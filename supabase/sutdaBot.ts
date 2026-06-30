/**
 * 섯다 테스트 봇 — 시드 계정으로 로그인해 자동으로 한 자리를 채워준다.
 * (혼자 테스트할 때 둘째 플레이어 대용)
 *
 * 사용법:
 *   npx tsx supabase/sutdaBot.ts [username] [strategy]
 *   - username : 로그인할 시드 계정 (기본 minsu)
 *   - strategy : call | aggressive | scared  (기본 call)
 *
 * 동작: 가장 최근의 '대기/결과' 방에 자동 합류 → 내 차례마다 액션.
 *       방장(=브라우저의 당신)이 "판 시작"을 누르면 봇이 알아서 콜/다이.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DOMAIN = process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN ?? "poongsan.app";

// 봇 전용 계정 (서비스 키로 자동 생성)
const username = process.argv[2] ?? "sutdabot";
const password = "sutdabot-pw-1234";
const displayName = process.argv[2] ? `🤖 ${process.argv[2]}` : "🤖 봇";
const strategy = process.argv[3] ?? "call";

const sb = createClient(URL, ANON, {
  auth: { autoRefreshToken: true, persistSession: false },
});
const adminc = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const email = `${username.toLowerCase()}@${DOMAIN}`;

// 봇 계정 보장: 없으면 생성, 프로필/골드 세팅
async function provision() {
  const { data: list, error } = await adminc.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  let user = list.users.find((u) => u.email === email) ?? null;
  if (!user) {
    const { data, error: cErr } = await adminc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, display_name: displayName },
    });
    if (cErr) throw cErr;
    user = data.user;
    console.log(`  + 봇 계정 생성: ${username}`);
  } else {
    await adminc.auth.admin.updateUserById(user.id, { password });
  }
  await adminc.from("profiles").upsert(
    { id: user!.id, username, display_name: displayName, role: "player", must_change_password: false },
    { onConflict: "id" }
  );
  const { data: prof } = await adminc
    .from("profiles")
    .select("gold_balance")
    .eq("id", user!.id)
    .maybeSingle();
  if (!prof || (prof.gold_balance ?? 0) < 50000) {
    await adminc.from("profiles").update({ gold_balance: 100000 }).eq("id", user!.id);
    console.log("  💰 봇에게 골드 100,000 지급");
  }
  return user!.id;
}

async function main() {
  await provision();
  const { data: auth, error: aerr } = await sb.auth.signInWithPassword({ email, password });
  if (aerr || !auth.user) {
    console.error(`❌ 로그인 실패(${email}):`, aerr?.message);
    return;
  }
  const myId = auth.user.id;
  console.log(`🤖 ${displayName} 로그인 완료 (${myId.slice(0, 8)}). 전략=${strategy}`);

  // 합류할 방 찾기
  const roomArg = Number(process.argv.find((a) => /^room=\d+$/.test(a))?.split("=")[1]);
  let roomId = roomArg || 0;
  if (!roomId) {
    // 가장 최근 대기/결과 방
    for (let i = 0; i < 60; i++) {
      const { data: rooms, error } = await sb
        .from("sutda_rooms")
        .select("id,status,name")
        .in("status", ["waiting", "showdown"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) {
        console.error("❌ sutda_rooms 조회 실패 — 마이그레이션(0009) 실행했나요?", error.message);
        process.exit(1);
      }
      if (rooms && rooms.length) {
        roomId = rooms[0].id;
        console.log(`🔎 방 발견: #${roomId} "${rooms[0].name}"`);
        break;
      }
      if (i === 0) console.log("⏳ 대기 중인 방을 기다리는 중… (브라우저에서 방을 만들어주세요)");
      await sleep(2000);
    }
  }
  if (!roomId) {
    console.error("❌ 합류할 방을 못 찾았습니다.");
    process.exit(1);
  }

  const { error: jerr } = await sb.rpc("sutda_join_room", { p_room: roomId });
  if (jerr) console.log("ℹ️ 합류:", jerr.message);
  else console.log(`✅ 방 #${roomId} 합류 완료. 방장이 '판 시작'을 누르면 자동으로 플레이합니다.`);

  let lastTurn = "";
  let lastStatus = "";
  let lastHand = -1;

  for (;;) {
    const { data: room } = await sb
      .from("sutda_rooms")
      .select("*")
      .eq("id", roomId)
      .maybeSingle();
    if (!room) {
      console.log("방이 사라졌습니다. 종료.");
      break;
    }
    if (room.status === "closed") {
      console.log("방이 종료되었습니다. 봇 종료.");
      break;
    }

    if (room.status !== lastStatus || room.hand_no !== lastHand) {
      lastStatus = room.status;
      lastHand = room.hand_no;
      if (room.status === "betting") {
        // 내 패 확인
        const { data: h } = await sb
          .from("sutda_hands")
          .select("card1,card2")
          .eq("room_id", roomId)
          .eq("hand_no", room.hand_no)
          .eq("user_id", myId)
          .maybeSingle();
        console.log(`🎴 ${room.hand_no}판 시작 — 내 패: ${h ? `[${h.card1},${h.card2}]` : "(미참여)"} / 팟 ${room.pot}`);
      } else if (room.status === "showdown") {
        const w = room.last_result?.winners ?? (room.last_result?.winner_id ? [room.last_result.winner_id] : []);
        const iWon = w.includes(myId);
        console.log(`🏁 쇼다운 — ${iWon ? "🎉 내가 이김!" : "졌거나 무관"} (팟 ${room.last_result?.pot ?? 0})`);
      }
    }

    // 내 차례면 액션
    if (room.status === "betting" && room.current_turn === myId) {
      const turnKey = `${room.hand_no}:${room.betting_round}:${room.current_turn}:${room.current_bet}`;
      if (turnKey !== lastTurn) {
        lastTurn = turnKey;
        const me = await sb
          .from("sutda_players")
          .select("committed,folded")
          .eq("room_id", roomId)
          .eq("user_id", myId)
          .maybeSingle();
        if (me.data && !me.data.folded) {
          const callCost = Math.max(room.current_bet - me.data.committed, 0);
          let action: "call" | "raise" | "fold" = "call";
          if (strategy === "aggressive") action = Math.random() < 0.5 ? "raise" : "call";
          else if (strategy === "scared") action = callCost > room.ante * 2 ? "fold" : "call";
          // 레이즈면 금액(증가분) 필요 — 삥(앤티) 또는 하프 중 랜덤
          const raiseInc =
            action === "raise"
              ? Math.random() < 0.5
                ? room.ante
                : Math.max(Math.floor((room.pot + callCost) / 2), 1)
              : 0;
          await sleep(800); // 사람처럼 약간 텀
          const { error } = await sb.rpc("sutda_action", { p_room: roomId, p_action: action, p_amount: raiseInc });
          console.log(`  ▶ ${action}${callCost ? `(콜 ${callCost})` : ""}${error ? ` ❌ ${error.message}` : " ✓"}`);
        }
      }
    }

    await sleep(1500);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
