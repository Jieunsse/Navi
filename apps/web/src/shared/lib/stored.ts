"use client";
import { useSyncExternalStore } from "react";

const EVT = "nabi-stored";

/** 브라우저에 저장한 문자열 하나를 읽고 쓴다. 저장이 막힌 브라우저에서는 저장하지 않고 이번 방문에만 쓴다. */
export function useStored(key: string, server: string | null): [string | null, (v: string) => void] {
  const subscribe = (cb: () => void) => {
    window.addEventListener(EVT, cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener(EVT, cb);
      window.removeEventListener("storage", cb);
    };
  };
  const read = () => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const value = useSyncExternalStore(subscribe, read, () => server);
  const set = (v: string) => {
    try {
      localStorage.setItem(key, v);
    } catch {
      // 저장이 막힌 브라우저에서는 이번 방문에만 적용한다.
    }
    window.dispatchEvent(new Event(EVT));
  };
  return [value, set];
}
