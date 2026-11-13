"use client";
import { chatApi } from "@nabi/shared/chat.ts";
import { useEffect, useState } from "react";
import { apiFetch } from "@/shared/api/apiFetch";

/** 방송 보기 화면을 열 때 한 번 묻는다. 방송자의 방송 금지 여부와, 내 채팅 막힘 안내(4-14, 4-15). 로그인하면 다시 묻는다. */
export function useBroadcastAccess(id: string, uid: string | undefined) {
  const [v, setV] = useState<{ ownerBroadcastBanned: boolean; chatBlock: string | null } | null>(null);
  useEffect(() => {
    let off = false;
    apiFetch(chatApi.broadcastAccess, {}, { id })
      .then((r) => !off && setV(r))
      .catch(() => undefined); // 못 불러오면 평소처럼 보여준다. 서버가 쓰기를 막는다.
    return () => {
      off = true;
    };
  }, [id, uid]);
  return v;
}
