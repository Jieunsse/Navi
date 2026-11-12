"use client";
import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const app =
  getApps()[0] ??
  initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });

export const auth = getAuth(app);
export const firestore = getFirestore(app);

const g = globalThis as { __nabiEmu?: boolean };
if (process.env.NEXT_PUBLIC_USE_EMULATORS === "true" && !g.__nabiEmu) {
  g.__nabiEmu = true;
  // 휴대폰으로 같은 와이파이에서 열 때도 붙도록 페이지 주소의 호스트를 쓴다.
  const host = typeof location !== "undefined" ? location.hostname : "127.0.0.1";
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(firestore, host, 8080);
}
