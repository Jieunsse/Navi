import { findBannedWord, TERMS_VERSION, TEST_ACCOUNTS, type TestAccountKey } from "@nabi/shared";
import type { z } from "zod";
import type { signupSchema } from "@nabi/shared";
import { adminAuth, db, FieldValue, Timestamp } from "../adapters/firebase.ts";
import { AppError, badRequest, conflict } from "../errors.ts";
import { getBannedWords } from "./bannedWords.ts";

export const nicknameKey = (n: string) => n.toLowerCase();

export async function assertNicknameAllowed(nickname: string) {
  if (findBannedWord(nickname, await getBannedWords())) throw badRequest("NICKNAME_BANNED", "쓸 수 없는 닉네임이에요");
}

export async function checkNickname(nickname: string) {
  await assertNicknameAllowed(nickname);
  const snap = await db().collection("nicknames").doc(nicknameKey(nickname)).get();
  if (snap.exists) throw conflict("NICKNAME_TAKEN", "이미 쓰고 있는 닉네임이에요");
}

/** 새 사용자 문서와 닉네임 문서를 한 트랜잭션에서 만든다(4-1 회원가입 3단계). */
export async function createUserDocs(uid: string, nickname: string, email: string | null, extra: Record<string, unknown> = {}) {
  await assertNicknameAllowed(nickname);
  const fs = db();
  const nickRef = fs.collection("nicknames").doc(nicknameKey(nickname));
  const userRef = fs.collection("users").doc(uid);
  await fs.runTransaction(async (tx) => {
    if ((await tx.get(nickRef)).exists) throw conflict("NICKNAME_TAKEN", "이미 쓰고 있는 닉네임이에요");
    const now = Timestamp.now();
    tx.create(nickRef, { uid, status: "active" });
    tx.create(userRef, {
      nickname,
      email,
      grade: "egg",
      broadcastCount: 0,
      totalBroadcastMs: 0,
      donationReceivedCount: 0,
      agreements: { items: ["age14", "terms", "streamerTerms", "privacy"], version: TERMS_VERSION, agreedAt: now },
      createdAt: now,
      ...extra,
    });
    tx.create(userRef.collection("gradeHistory").doc(), { grade: "egg", shareRate: 0.8, changedAt: now });
  });
}

async function deleteUserDocs(uid: string, nickname: string) {
  const fs = db();
  const user = fs.collection("users").doc(uid);
  const history = await user.collection("gradeHistory").get();
  const batch = fs.batch();
  history.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(user);
  batch.delete(fs.collection("nicknames").doc(nicknameKey(nickname)));
  await batch.commit();
}

export async function signup(input: z.output<typeof signupSchema>) {
  const uid = db().collection("users").doc().id;
  await createUserDocs(uid, input.nickname, input.email);
  try {
    await adminAuth().createUser({ uid, email: input.email, password: input.password });
  } catch (e) {
    await deleteUserDocs(uid, input.nickname);
    if ((e as { code?: string }).code === "auth/email-already-exists") throw conflict("EMAIL_TAKEN", "이미 가입된 이메일이에요");
    throw e;
  }
}

const RATE_LIMIT_PER_HOUR = 20;

/** 테스트 계정 버튼 로그인(4-18). 환경 변수로 켜고, 같은 IP에서 1시간 20번까지만. */
export async function testLoginToken(account: TestAccountKey, ip: string) {
  if (process.env.ENABLE_TEST_LOGIN !== "true") throw new AppError(403, "TEST_LOGIN_OFF", "테스트 계정 로그인이 꺼져 있어요");
  const hour = new Date().toISOString().slice(0, 13).replace(/\D/g, "");
  const ref = db().collection("rateLimits").doc(`testLogin_${ip.replace(/[^\w.:-]/g, "_")}_${hour}`);
  await db().runTransaction(async (tx) => {
    const count = ((await tx.get(ref)).data()?.count as number | undefined) ?? 0;
    if (count >= RATE_LIMIT_PER_HOUR) throw new AppError(429, "RATE_LIMITED", "잠시 뒤에 다시 시도해 주세요");
    tx.set(ref, { count: FieldValue.increment(1), expiresAt: Timestamp.fromMillis(Date.now() + 3600_000) }, { merge: true });
  });
  return adminAuth().createCustomToken(TEST_ACCOUNTS[account]);
}
