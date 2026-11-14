// pnpm check-recording → 녹화 흐름을 가짜 egress·저장소와 Firestore 에뮬레이터로 돌려 본다(07 4-9, 4-10).
// 에뮬레이터가 떠 있어야 한다. 쓰는 문서는 이름에 chk-가 붙고, 끝나면 지운다.
import assert from "node:assert/strict";
import { EgressStatus, type EgressInfo } from "livekit-server-sdk";
import { createFakeEgress } from "../src/adapters/egress.ts";
import { db, Timestamp } from "../src/adapters/firebase.ts";
import { createFakeStorage } from "../src/adapters/storage.ts";
import type { LiveKitPort } from "../src/adapters/livekit.ts";
import { broadcastUseCases } from "../src/application/broadcast.ts";
import { recordingUseCases } from "../src/application/recording.ts";
import { usageMonth } from "../src/domain/recording.ts";
import type { Viewer } from "../src/application/auth.ts";

const MIN = 60_000;
const run = `chk-${Date.now()}`;
const egress = createFakeEgress();
const storage = createFakeStorage();
const closed: string[] = [];
const lk: LiveKitPort = {
  url: "ws://fake",
  token: async () => "t",
  isPublishing: async () => true,
  isInRoom: async () => true,
  countViewers: async () => 0,
  closeRoom: async (r) => void closed.push(r),
  receiveWebhook: async () => {
    throw new Error("unused");
  },
  send: async () => undefined,
};
const rec = recordingUseCases(egress, storage);
const bc = broadcastUseCases(lk, rec);
const viewer = (uid: string): Viewer => ({ uid, user: { nickname: uid, email: null, grade: "egg" } });
const owner = viewer(`${run}-owner`);
const other = viewer(`${run}-other`);
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code ?? "error");
const usedMs = async () => ((await db().collection("usage").doc(usageMonth(new Date())).get()).data()?.usedMs as number | undefined) ?? 0;
const ended = (egressId: string, filename: string | null, seconds = 90, status = EgressStatus.EGRESS_COMPLETE) =>
  ({ egressId, status, fileResults: filename ? [{ filename, duration: BigInt(seconds) * 1_000_000_000n }] : [] }) as unknown as EgressInfo;

async function newBroadcast(extra: Record<string, unknown> = {}) {
  const ref = db().collection("broadcasts").doc();
  await ref.set({
    ownerId: owner.uid, ownerNickname: owner.user.nickname, title: "확인 방송", sourceType: "screen", status: "ready",
    recordingEnabled: false, roomName: ref.id, donationTotal: 0, donationCount: 0, createdAt: Timestamp.now(), startedAt: null, endedAt: null, ...extra,
  });
  await ref.collection("comments").doc("c1").set({ content: "채팅", createdAt: Timestamp.now() });
  return ref.id;
}
const recOf = async (id: string) => (await db().collection("recordings").doc(id).get()).data()!;
const bOf = async (id: string) => (await db().collection("broadcasts").doc(id).get()).data()!;

await db().collection("users").doc(owner.uid).set({ nickname: owner.uid, broadcastCount: 0, totalBroadcastMs: 0 }); // 종료 함수가 방송자 통계를 더한다
const startUsed = await usedMs();
const made: string[] = [];
async function liveWithRecording() {
  const id = await newBroadcast();
  made.push(id);
  await bc.publishToken(owner, id, true);
  assert.equal(await bc.confirmLive(id), "live");
  return id;
}

// 1~3. 방송 시작 → 녹화 시작(한 번만), 사용량 3분 예약
const id1 = await liveWithRecording();
let b = await bOf(id1);
assert.equal(b.recordingEnabled, true);
assert.equal(egress.started.length, 1);
assert.equal(egress.started[0]!.room, id1);
const rid1 = b.recordingId as string;
assert.equal((await recOf(rid1)).status, "recording");
assert.equal((await recOf(rid1)).isPublic, false);
assert.equal(await usedMs(), startUsed + 3 * MIN);
await bc.confirmLive(id1);
assert.equal(egress.started.length, 1, "두 번째 송출 확인은 녹화를 또 시작하지 않는다");
console.log("1. 녹화 켠 방송을 시작하면 녹화 중이 되고 사용량 3분이 잡힌다: 통과");

// 녹화를 끄고 시작하면 녹화하지 않는다
const idOff = await newBroadcast();
made.push(idOff);
await bc.publishToken(owner, idOff, false);
await bc.confirmLive(idOff);
assert.equal(egress.started.length, 1);
console.log("2. 녹화를 끈 방송은 녹화하지 않는다: 통과");

// 4. 녹화 멈춤(3분 제한). 주인만, 방송 중일 때만, 두 번 눌러도 한 번만
assert.equal(await code(rec.stopByOwner(other, id1)), "FORBIDDEN");
await rec.stopByOwner(owner, id1);
await rec.stopByOwner(owner, id1);
assert.deepEqual(egress.stopped, [egress.started[0]!.egressId]);
assert.equal(await code(rec.stopByOwner(owner, idOff)), "NOT_RECORDING");
console.log("3. 녹화 멈춤은 주인만, 한 번만 egress에 전달된다: 통과");

// 5. 서버 확인: 시작 4분 뒤 채팅·시청 요청이 오면 멈춘다
const id2 = await liveWithRecording();
const rid2 = (await bOf(id2)).recordingId as string;
await db().collection("recordings").doc(rid2).update({ startedAt: Timestamp.fromMillis(Date.now() - 4 * MIN) });
const before = egress.stopped.length;
assert.equal(await bc.enforceTestLimit(id2), false);
assert.equal(egress.stopped.length, before + 1);
await bc.enforceTestLimit(id2);
assert.equal(egress.stopped.length, before + 1, "이미 멈춤을 요청했으면 또 하지 않는다");
console.log("4. 3분이 지난 녹화는 채팅·시청 권한 요청 때 서버가 멈춘다: 통과");

// 6. 종료 함수: 같은 트랜잭션에서 녹화 중 → 처리 중
assert.equal(await code(bc.remove(owner, id1)), "BROADCAST_LIVE");
await bc.endByOwner(owner, id1);
assert.equal((await bOf(id1)).status, "ended");
const r1 = await recOf(rid1);
assert.equal(r1.status, "processing");
assert.ok(r1.endedAt);
assert.deepEqual(closed.filter((x) => x === id1), [id1]);
console.log("5. 방송 종료 때 녹화 중이 처리 중으로 바뀐다: 통과");

// 7. 처리 중이면 방송 삭제·녹화 삭제 거절
assert.equal(await code(bc.remove(owner, id1)), "RECORDING_PROCESSING");
assert.equal(await code(rec.remove(owner, rid1)), "RECORDING_BUSY");
assert.equal(await code(rec.setPublic(owner, rid1, true)), "NOT_READY");
console.log("6. 처리 중이면 방송 삭제와 녹화 삭제가 거절된다: 통과");

// 8. 웹훅 egress_ended: 볼 수 있음, 길이, 사용량을 실제 길이로 고침, 비공개
const key1 = r1.storageKey as string;
await rec.onEgressEnded(ended(r1.egressId, key1, 90));
const r1b = await recOf(rid1);
assert.equal(r1b.status, "ready");
assert.equal(r1b.durationMs, 90_000);
assert.equal(r1b.isPublic, false);
assert.equal(storage.removed.length, 0);
assert.equal(await usedMs(), startUsed + 3 * MIN + (90_000 - 3 * MIN) + 3 * MIN /* id2 예약분 */ + 0);
await rec.onEgressEnded(ended(r1.egressId, key1, 90)); // 같은 알림이 또 와도 그대로
assert.equal((await recOf(rid1)).status, "ready");
assert.deepEqual(storage.removed, [key1], "이미 닫힌 녹화에 늦게 온 알림은 파일을 지운다");
storage.removed.length = 0;
console.log("7. egress_ended가 볼 수 있음으로 바꾸고 길이와 사용량을 고친다: 통과");

// 9. 재생: 비공개는 주인만, 공개하면 누구나, 주소는 30분
assert.equal(await code(rec.getReplay(null, rid1)), "NOT_FOUND");
assert.equal(await code(rec.getReplay(other.uid, rid1)), "NOT_FOUND");
const mine = await rec.getReplay(owner.uid, rid1);
assert.match(mine.playUrl, /ttl=1800/);
assert.equal(storage.signed[0]!.key, key1);
assert.equal(await rec.publicRecordingOf(id1), null);
assert.equal(await code(rec.setPublic(other, rid1, true)), "FORBIDDEN");
await rec.setPublic(owner, rid1, true);
assert.equal((await rec.getReplay(null, rid1)).recording.id, rid1);
assert.equal(await rec.publicRecordingOf(id1), rid1);
assert.ok((await rec.listPublic()).some((x) => x.id === rid1));
await rec.setPublic(owner, rid1, false);
assert.ok(!(await rec.listPublic()).some((x) => x.id === rid1));
assert.equal(await code(rec.getReplay(null, rid1)), "NOT_FOUND");
console.log("8. 비공개는 주인만, 공개하면 누구나 재생하고 서명 주소는 30분이다: 통과");

// 10. 처리 중 30분이 지나면 실패로 바꾸고 방송을 지울 수 있다. 늦게 온 알림은 파일을 지운다
await bc.endByOwner(owner, id2);
const rid2doc = await recOf(rid2);
assert.equal(rid2doc.status, "processing");
await db().collection("recordings").doc(rid2).update({ endedAt: Timestamp.fromMillis(Date.now() - 31 * MIN) });
await db().collection("donations").doc(`${run}-d1`).set({
  streamerId: owner.uid, broadcastId: id2, broadcastTitle: "확인 방송", anonymous: true, donorNickname: "후원자", amount: 1000, delivered: 1000,
  shareRate: 0.8, streamerEarning: 800, createdAt: Timestamp.now(),
});
const studio = await rec.studio(owner); // 열 때 30분 넘은 처리 중을 실패로 바꾼다
assert.equal((await recOf(rid2)).status, "failed");
const item2 = studio.ended.find((i) => i.broadcast.id === id2)!;
assert.equal(item2.recording?.status, "failed");
assert.equal(item2.donations[0]?.donor, "익명");
assert.equal(item2.donationTotal, 1000);
await bc.remove(owner, id2);
assert.equal((await db().collection("broadcasts").doc(id2).get()).exists, false);
assert.equal((await db().collection("broadcasts").doc(id2).collection("comments").get()).size, 0, "채팅도 지운다");
assert.equal((await db().collection("recordings").doc(rid2).get()).exists, false);
assert.ok(storage.removed.includes(rid2doc.storageKey));
assert.equal((await db().collection("donations").doc(`${run}-d1`).get()).exists, true, "후원 기록은 남는다");
const after = await rec.studio(owner);
assert.ok(after.deletedDonations.some((d) => d.id === `${run}-d1` && d.earning === 800));
assert.ok(!after.ended.some((i) => i.broadcast.id === id2));
storage.removed.length = 0;
await rec.onEgressEnded(ended(rid2doc.egressId, rid2doc.storageKey, 10)); // 녹화 정보가 없다
assert.deepEqual(storage.removed, [rid2doc.storageKey]);
console.log("9. 처리 중 30분 뒤 실패, 방송 삭제는 채팅·녹화를 지우고 후원은 남긴다, 주인 없는 파일은 지운다: 통과");

// 11. 녹화 삭제(볼 수 있음일 때)
storage.removed.length = 0;
await rec.remove(owner, rid1);
assert.equal((await db().collection("recordings").doc(rid1).get()).exists, false);
assert.deepEqual(storage.removed, [key1]);
assert.equal((await bOf(id1)).recordingId, null);
console.log("10. 녹화 삭제는 파일과 녹화 정보를 함께 지운다: 통과");

// 12. 월 50분 제한: 방송은 계속되고 녹화만 실패로 남는다
const used = await usedMs();
await db().collection("usage").doc(usageMonth(new Date())).set({ usedMs: 48 * MIN });
const id3 = await liveWithRecording();
b = await bOf(id3);
assert.equal(b.status, "live");
assert.equal(b.recordingFailReason, "quota");
assert.equal((await recOf(b.recordingId)).status, "failed");
assert.equal(await usedMs(), 48 * MIN, "시작하지 못했으니 사용량은 그대로");
// 13. egress가 거절해도 방송은 계속되고 예약한 3분은 돌려준다
await db().collection("usage").doc(usageMonth(new Date())).set({ usedMs: 10 * MIN });
egress.failStart = true;
const id4 = await liveWithRecording();
b = await bOf(id4);
assert.equal(b.status, "live");
assert.equal(b.recordingFailReason, "error");
assert.equal(await usedMs(), 10 * MIN);
egress.failStart = false;
await db().collection("usage").doc(usageMonth(new Date())).set({ usedMs: used });
console.log("11. 월 한도와 egress 실패는 녹화만 실패로 남기고 방송은 계속된다: 통과");

// 14. 내 방송 관리: 처리 중 녹화가 있는 방송을 지우려 하면 거절
const id5 = await liveWithRecording();
await bc.endByOwner(owner, id5);
assert.equal(await code(bc.remove(owner, id5)), "RECORDING_PROCESSING");
console.log("12. 녹화 처리 중인 방송 삭제 거절: 통과");

// 정리
for (const id of [...made]) {
  const bd = (await db().collection("broadcasts").doc(id).get()).data();
  if (bd?.recordingId) await db().collection("recordings").doc(bd.recordingId).delete();
  await db().recursiveDelete(db().collection("broadcasts").doc(id));
}
const stale = await db().collection("recordings").where("ownerId", "==", owner.uid).get();
await Promise.all(stale.docs.map((d) => d.ref.delete()));
await db().collection("donations").doc(`${run}-d1`).delete();
await db().collection("users").doc(owner.uid).delete();
await db().collection("usage").doc(usageMonth(new Date())).set({ usedMs: startUsed });
console.log("모든 확인 통과");
process.exit(0);
