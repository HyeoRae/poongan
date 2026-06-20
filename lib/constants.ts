// 로그인 ID를 Supabase Auth 이메일로 매핑하는 규칙.
// 사용자에겐 ID만 노출하고, 내부적으로는 <id>@<domain> 이메일로 인증한다.
export const LOGIN_EMAIL_DOMAIN =
  process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN ?? "poongsan.app";

export function idToEmail(id: string): string {
  return `${id.trim().toLowerCase()}@${LOGIN_EMAIL_DOMAIN}`;
}

export function emailToId(email: string): string {
  return email.split("@")[0];
}

export type Role = "admin" | "player";

export type TxType =
  | "admin_grant"
  | "game"
  | "gamble"
  | "transfer"
  | "steal"
  | "shop";
