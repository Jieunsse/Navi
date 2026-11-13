"use client";
import { chatItemSchema, type ChatItem } from "@nabi/shared/chat.ts";
import { RoomEvent, type Room } from "livekit-client";
import { useEffect, useState } from "react";
import { cx } from "@/shared/ui";

const SHOW_MS = 4000; // 시안의 nudge/toast-ms
const BIG = 100_000; // 10만 꿀 이상은 큰 알림(4-8)
const shadow = { textShadow: "0 1px 4px rgba(0,0,0,0.8)" };

/** 송출 화면 영상 위쪽 가운데에 잠깐 뜨는 후원 알림. LiveKit의 donation 데이터를 받아 띄운다(4-4의 7번, 4-8). */
export function DonationAlert({ room }: { room: Room | null }) {
  const [alert, setAlert] = useState<ChatItem | null>(null);

  useEffect(() => {
    if (!room) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onData = (payload: Uint8Array, _p: unknown, _k: unknown, topic?: string) => {
      if (topic !== "donation") return;
      try {
        const p = chatItemSchema.safeParse(JSON.parse(new TextDecoder().decode(payload)));
        if (!p.success || p.data.amount == null) return;
        setAlert(p.data);
        clearTimeout(timer);
        timer = setTimeout(() => setAlert(null), SHOW_MS);
      } catch {}
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
      clearTimeout(timer);
    };
  }, [room]);

  if (!alert) return null;
  const big = (alert.amount ?? 0) >= BIG;
  const size = big ? "text-[20px]" : "text-[18px]";
  return (
    <div key={alert.messageId} role="status" className="pointer-events-none absolute inset-x-0 top-6 z-10 flex flex-col items-center gap-1 text-on-video">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/donation/art.png" alt="" className={big ? "size-[200px]" : "size-[140px]"} />
      <p className={cx("flex items-center font-bold leading-[1.4]", size)} style={shadow}>
        <span className="text-live-ink">{alert.authorNickname}</span>
        <span>님이&nbsp;</span>
        <span className="flex items-center gap-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/donation/honey.svg" alt="" className={big ? "size-[22px]" : "size-5"} />
          {(alert.amount ?? 0).toLocaleString("ko-KR")}
        </span>
        <span>&nbsp;후원!</span>
      </p>
      {!alert.hidden && alert.content && (
        <p className="max-w-[300px] break-words text-center text-body-16" style={shadow}>
          {alert.content}
        </p>
      )}
    </div>
  );
}
