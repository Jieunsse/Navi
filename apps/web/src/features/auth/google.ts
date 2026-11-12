"use client";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { auth } from "@/shared/lib/firebase";

export const GOOGLE_FAIL = "구글 로그인에 실패했어요. 다시 시도해 주세요";

/** 구글 로그인(4-1). 팝업을 먼저 쓰고, 브라우저가 막으면 페이지 이동 방식으로 바꾼다. 창을 닫은 것은 오류가 아니다. */
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "auth/popup-blocked") return signInWithRedirect(auth, provider);
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
    throw e;
  }
}
