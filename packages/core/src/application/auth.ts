import type { Me } from "@nabi/shared";
import { adminAuth, db } from "../adapters/firebase.ts";
import { AppError, unauthorized } from "../errors.ts";

export type UserDoc = {
  nickname: string;
  email: string | null;
  grade: string;
  isAdmin?: boolean;
  isTestAdmin?: boolean;
  seedKind?: string | null;
};
export type Viewer = { uid: string; user: UserDoc; authTime?: number };

/** Authorization 헤더의 로그인 토큰을 확인하고 사용자 문서를 읽는다. 문서가 없으면 비로그인과 같다(4-1). */
export async function requireUser(authHeader: string | null): Promise<Viewer> {
  const token = authHeader?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw unauthorized();
  const decoded = await adminAuth()
    .verifyIdToken(token)
    .catch(() => {
      throw unauthorized();
    });
  const snap = await db().collection("users").doc(decoded.uid).get();
  if (!snap.exists) throw new AppError(401, "SIGNUP_INCOMPLETE", "가입을 마무리해 주세요");
  // 영구 정지(4-15): 이미 받은 로그인 토큰도 바로 막는다.
  if (snap.data()?.suspended) throw new AppError(403, "SUSPENDED", "운영정책 위반으로 이용이 정지된 계정이에요");
  // 전체 초기화 중에는 시드 계정의 요청을 받지 않는다(4-18). 10분 넘게 남은 잠금은 멈춘 것으로 본다.
  if (snap.data()?.seedKind) {
    const s = (await db().collection("config").doc("seedState").get()).data();
    if (s?.resetting && Date.now() - ((s.resettingAt?.toMillis() as number | undefined) ?? 0) < 10 * 60_000) throw new AppError(503, "SEED_RESETTING", "테스트 계정을 준비하는 중이에요");
  }
  return { uid: decoded.uid, user: snap.data() as UserDoc, authTime: decoded.auth_time };
}

export function toMe({ uid, user }: Viewer): Me {
  return {
    uid,
    nickname: user.nickname,
    email: user.email,
    grade: user.grade,
    isAdmin: !!user.isAdmin,
    seedKind: user.seedKind ?? null,
  };
}
