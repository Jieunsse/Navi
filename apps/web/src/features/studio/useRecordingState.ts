"use client";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { firestore } from "@/shared/lib/firebase";

export type RecordingState = { startedAt: Date | null; failReason: "quota" | "error" | null };

/** 송출 화면이 녹화 시작 시각과 실패 이유를 보는 용도. 방송 문서에 서버가 적어 둔다(4-9). */
export function useRecordingState(broadcastId: string) {
  const [s, setS] = useState<RecordingState>({ startedAt: null, failReason: null });
  useEffect(
    () =>
      onSnapshot(doc(firestore, "broadcasts", broadcastId), (snap) => {
        const d = snap.data();
        setS({ startedAt: d?.recordingStartedAt instanceof Timestamp ? d.recordingStartedAt.toDate() : null, failReason: d?.recordingFailReason ?? null });
      }),
    [broadcastId],
  );
  return s;
}
