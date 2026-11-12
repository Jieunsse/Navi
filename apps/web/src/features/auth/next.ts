"use client";
import { useSearchParams } from "next/navigation";

/** 로그인 뒤 돌아갈 주소. 다른 사이트로 보내지 않게 "/"로 시작하는 주소만 받는다. */
export function useNextPath() {
  const next = useSearchParams().get("next") ?? "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
