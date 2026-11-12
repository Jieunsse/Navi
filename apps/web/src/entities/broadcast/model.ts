"use client";
import { READY_VISIBLE_MS, type BroadcastStatus, type SourceType } from "@nabi/shared";
import { collection, doc, limit, onSnapshot, orderBy, query, Timestamp, where, type DocumentData } from "firebase/firestore";
import { useEffect, useState } from "react";
import { firestore } from "@/shared/lib/firebase";

export type LiveBroadcast = {
  id: string;
  ownerId: string;
  ownerNickname: string;
  title: string;
  sourceType: SourceType;
  withCamera: boolean;
  status: BroadcastStatus;
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  donationTotal: number;
};

const toDate = (t: unknown) => (t instanceof Timestamp ? t.toDate() : null);
function fromDoc(id: string, d: DocumentData): LiveBroadcast {
  return {
    id,
    ownerId: d.ownerId,
    ownerNickname: d.ownerNickname,
    title: d.title,
    sourceType: d.sourceType,
    withCamera: d.withCamera ?? false,
    status: d.status,
    createdAt: toDate(d.createdAt) ?? new Date(),
    startedAt: toDate(d.startedAt),
    endedAt: toDate(d.endedAt),
    donationTotal: d.donationTotal ?? 0,
  };
}

/** 홈 목록: 방송 중(최근 시작순) 다음에 1시간 안에 만든 준비 중(최근 만든 순)(4-2, 결정 19). */
export function useHomeBroadcasts(max = 50) {
  const [live, setLive] = useState<LiveBroadcast[] | null>(null);
  const [ready, setReady] = useState<LiveBroadcast[] | null>(null);
  useEffect(() => {
    const col = collection(firestore, "broadcasts");
    const off1 = onSnapshot(query(col, where("status", "==", "live"), orderBy("startedAt", "desc"), limit(max)), (s) =>
      setLive(s.docs.map((d) => fromDoc(d.id, d.data()))),
    );
    const cutoff = Timestamp.fromMillis(Date.now() - READY_VISIBLE_MS);
    const off2 = onSnapshot(query(col, where("status", "==", "ready"), where("createdAt", ">", cutoff), orderBy("createdAt", "desc"), limit(max)), (s) =>
      setReady(s.docs.map((d) => fromDoc(d.id, d.data()))),
    );
    return () => {
      off1();
      off2();
    };
  }, [max]);
  return { live, ready, loading: live === null || ready === null };
}

/** 방송 문서 하나를 실시간으로 본다. 없으면 null, 읽는 중이면 undefined. */
export function useBroadcastDoc(id: string) {
  const [b, setB] = useState<LiveBroadcast | null | undefined>(undefined);
  useEffect(() => onSnapshot(doc(firestore, "broadcasts", id), (s) => setB(s.exists() ? fromDoc(s.id, s.data()) : null), () => setB(null)), [id]);
  return b;
}
