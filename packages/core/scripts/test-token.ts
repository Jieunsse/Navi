// pnpm test-token 시청자 → 그 버튼 계정의 로그인 토큰(ID 토큰)을 출력한다. curl 확인용(4-18).
import { TEST_ACCOUNTS } from "@nabi/shared";

const names: Record<string, keyof typeof TEST_ACCOUNTS> = { 방송자: "broadcaster", 시청자: "viewer", 운영자: "admin" };
const key = names[process.argv[2] ?? ""] ?? (process.argv[2] as keyof typeof TEST_ACCOUNTS);
if (!TEST_ACCOUNTS[key]) throw new Error("방송자, 시청자, 운영자 중 하나를 적어 주세요");

const base = process.env.NABI_URL ?? "http://localhost:3000";
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "demo-key";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const res = await fetch(`${base}/api/auth/test-login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ account: key }),
});
const { token } = (await res.json()) as { token: string };
const signIn = authHost
  ? `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`
  : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`;
const r = await fetch(signIn, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }) });
console.log(((await r.json()) as { idToken: string }).idToken);
