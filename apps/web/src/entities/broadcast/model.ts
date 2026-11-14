"use client";
import { asCategory, READY_VISIBLE_MS, type CategoryId, type BroadcastStatus, type SourceType } from "@nabi/shared";
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
  category: CategoryId;
  /** 지금 보고 있는 시청자 수(서버가 웹훅마다 다시 센 값) */
  viewerCount: number;
  status: BroadcastStatus;
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  donationTotal: number;
  /** 시드가 만든 예시 방송이면 true. 영상은 나오지 않는다. */
  seedData: boolean;
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
    category: asCategory(d.category),
    viewerCount: d.viewerCount ?? 0,
    status: d.status,
    createdAt: toDate(d.createdAt) ?? new Date(),
    startedAt: toDate(d.startedAt),
    endedAt: toDate(d.endedAt),
    donationTotal: d.donationTotal ?? 0,
    seedData: d.seedData === true,
  };
}

/** 새로고침 아이콘이 최소한 도는 시간(너무 빨리 끝나 깜빡이는 것을 막는다) */
const MIN_REFRESH_MS = 400;
/** 서버 응답이 안 와도(오프라인 등) 이 시간 뒤에는 돌기를 멈춘다 */
const MAX_REFRESH_MS = 5000;

/**
 * 홈 목록: 방송 중(최근 시작순) 다음에 1시간 안에 만든 준비 중(최근 만든 순)(4-2, 결정 19).
 * 구독은 실시간이라 방송·시청자 수는 저절로 바뀌지만, "1시간 전" 기준 시각은 구독을 만들 때 한 번만 정해진다.
 * refresh()는 구독을 끊고 새로 붙여 기준 시각과 서버 값을 다시 받는다.
 */
export function useHomeBroadcasts(max = 50) {
  const [live, setLive] = useState<LiveBroadcast[] | null>(null);
  const [ready, setReady] = useState<LiveBroadcast[] | null>(null);
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const started = Date.now();
    const fresh = { live: false, ready: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setRefreshing(false), Math.max(0, MIN_REFRESH_MS - (Date.now() - started)));
    };
    const mark = (k: "live" | "ready") => {
      fresh[k] = true;
      if (fresh.live && fresh.ready) finish();
    };
    const giveUp = setTimeout(() => setRefreshing(false), MAX_REFRESH_MS);
    const col = collection(firestore, "broadcasts");
    // 오류가 나면 구독이 끊기므로 빈 목록으로 두고(무한 로딩 방지) 새로고침으로 다시 붙일 수 있게 한다.
    const off1 = onSnapshot(
      query(col, where("status", "==", "live"), orderBy("startedAt", "desc"), limit(max)),
      (s) => {
        setLive(s.docs.map((d) => fromDoc(d.id, d.data())));
        if (!s.metadata.fromCache) mark("live"); // 캐시가 아닌 서버 값을 받았을 때만 새로고침이 끝난 것으로 본다
      },
      () => {
        setLive((v) => v ?? []);
        mark("live");
      },
    );
    const cutoff = Timestamp.fromMillis(Date.now() - READY_VISIBLE_MS);
    const off2 = onSnapshot(
      query(col, where("status", "==", "ready"), where("createdAt", ">", cutoff), orderBy("createdAt", "desc"), limit(max)),
      (s) => {
        setReady(s.docs.map((d) => fromDoc(d.id, d.data())));
        if (!s.metadata.fromCache) mark("ready");
      },
      () => {
        setReady((v) => v ?? []);
        mark("ready");
      },
    );
    return () => {
      off1();
      off2();
      clearTimeout(timer);
      clearTimeout(giveUp);
    };
  }, [max, tick]);
  const refresh = () => {
    setRefreshing(true);
    setTick((t) => t + 1);
  };
  return { live, ready, loading: live === null || ready === null, refreshing, refresh };
}

/** 방송 문서 하나를 실시간으로 본다. 없으면 null, 읽는 중이면 undefined. */
export function useBroadcastDoc(id: string) {
  const [b, setB] = useState<LiveBroadcast | null | undefined>(undefined);
  useEffect(() => onSnapshot(doc(firestore, "broadcasts", id), (s) => setB(s.exists() ? fromDoc(s.id, s.data()) : null), () => setB(null)), [id]);
  return b;
}
