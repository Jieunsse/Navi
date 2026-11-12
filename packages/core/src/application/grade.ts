import { GRADE_BENEFITS, PROMOTION, type Grade, type GradeInfo, type Stats } from "@nabi/shared/grade.ts";
import type { Transaction } from "firebase-admin/firestore";
import { db, iso, Timestamp } from "../adapters/firebase.ts";
import { asGrade, nextGrade, promotedGrade } from "../domain/grade.ts";
import { promoted } from "../domain/notification.ts";
import type { Viewer } from "./auth.ts";
import { writeNotification } from "./notification.ts";

const userRef = (uid: string) => db().collection("users").doc(uid);

/** 이 트랜잭션에서 더하려는 값. 사용자 문서에는 아직 반영되기 전이라 읽은 값에 더해서 판단한다. */
export type StatDelta = Partial<Stats>;
export type Promotion = { uid: string; to: Grade };

/**
 * 읽기 단계. Firestore 트랜잭션은 읽기를 모두 끝낸 뒤에 써야 하므로, 쓰기가 시작되기 전에 부른다.
 * 승급할 때만 값을 돌려준다.
 */
export async function readPromotion(tx: Transaction, uid: string, delta: StatDelta = {}): Promise<Promotion | null> {
  const d = (await tx.get(userRef(uid))).data();
  if (!d) return null;
  const to = promotedGrade(asGrade(d.grade), {
    broadcastCount: ((d.broadcastCount as number | undefined) ?? 0) + (delta.broadcastCount ?? 0),
    totalBroadcastMs: ((d.totalBroadcastMs as number | undefined) ?? 0) + (delta.totalBroadcastMs ?? 0),
    donationCount: ((d.donationReceivedCount as number | undefined) ?? 0) + (delta.donationCount ?? 0),
  });
  return to ? { uid, to } : null;
}

/** 쓰기 단계. 등급을 바꾸고 등급 변경 내역에 한 줄을 남긴다(4-12). */
export function writePromotion(tx: Transaction, p: Promotion | null) {
  if (!p) return;
  tx.update(userRef(p.uid), { grade: p.to });
  tx.create(userRef(p.uid).collection("gradeHistory").doc(), { grade: p.to, shareRate: GRADE_BENEFITS[p.to].share / 100, changedAt: Timestamp.now() });
  writeNotification(tx, p.uid, promoted(p.to));
}

/** 읽기와 쓰기를 한 번에 한다. 이 트랜잭션에서 아직 아무것도 쓰지 않았을 때만 부를 수 있다. */
export async function checkPromotion(tx: Transaction, uid: string, delta: StatDelta = {}) {
  writePromotion(tx, await readPromotion(tx, uid, delta));
}

/** 내 등급 화면(`/me/grade`)에 필요한 값 */
export async function myGrade(viewer: Viewer): Promise<GradeInfo> {
  const [snap, hist] = await Promise.all([userRef(viewer.uid).get(), userRef(viewer.uid).collection("gradeHistory").orderBy("changedAt", "desc").get()]);
  const d = snap.data() ?? {};
  const grade = asGrade(d.grade);
  const next = nextGrade(grade);
  return {
    grade,
    sharePercent: GRADE_BENEFITS[grade].share,
    stats: { broadcastCount: d.broadcastCount ?? 0, totalBroadcastMs: d.totalBroadcastMs ?? 0, donationCount: d.donationReceivedCount ?? 0 },
    next: next && next !== "egg" ? { grade: next, ...PROMOTION[next] } : null,
    history: hist.docs.map((h) => {
      const x = h.data() as { grade: string; shareRate: number; changedAt: Timestamp };
      return { grade: asGrade(x.grade), shareRate: x.shareRate, changedAt: iso(x.changedAt)! };
    }),
  };
}
