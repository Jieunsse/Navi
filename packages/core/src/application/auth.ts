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
