import { PLAY_URL_TTL_SEC, RECORDING_MAX_MS, type Recording, type RecordingStatus, type StudioDonation, type StudioItem } from "@nabi/shared/recording.ts";
import { EgressStatus, type EgressInfo } from "livekit-server-sdk";
import { db, FieldValue, iso, Timestamp } from "../adapters/firebase.ts";
import type { EgressPort } from "../adapters/egress.ts";
import type { StoragePort } from "../adapters/storage.ts";
import { canPlay, canStartRecording, isBusy, shouldFailProcessing, shouldStopRecording, usageCorrection, usageMonth } from "../domain/recording.ts";
import { conflict, forbidden, notFound } from "../errors.ts";
import type { Viewer } from "./auth.ts";

type RecDoc = {
  broadcastId: string;
  ownerId: string;
  ownerNickname: string;
  broadcastTitle: string;
  egressId: string | null;
  status: RecordingStatus;
  isPublic: boolean;
  storageKey: string;
  durationMs: number | null;
  startedAt: Timestamp;
  endedAt: Timestamp | null;
  stopRequested: boolean;
  failReason?: "quota" | "error" | "egress";
};

export const recordingRef = (id: string) => db().collection("recordings").doc(id);
const usageRef = (month: string) => db().collection("usage").doc(month);
const broadcastRef = (id: string) => db().collection("broadcasts").doc(id);

export const NOT_PLAYABLE = "볼 수 없는 다시보기예요";

function toRecording(id: string, d: RecDoc): Recording {
  return {
    id,
    broadcastId: d.broadcastId,
    ownerId: d.ownerId,
    ownerNickname: d.ownerNickname,
    broadcastTitle: d.broadcastTitle,
    status: d.status,
    isPublic: d.isPublic,
    durationMs: d.durationMs,
    startedAt: iso(d.startedAt)!,
    endedAt: iso(d.endedAt),
  };
}

export function recordingUseCases(egress: EgressPort, storage: StoragePort) {
  async function removeFile(key: string | undefined | null) {
    if (key) await storage.remove(key);
  }

  /** "처리 중"으로 30분이 지났으면 실패로 바꾼다(결정 27). 바꿨으면 true. */
  async function failIfStale(id: string) {
    const ref = recordingRef(id);
    return db().runTransaction(async (tx) => {
      const r = (await tx.get(ref)).data() as RecDoc | undefined;
      if (!r || !shouldFailProcessing({ status: r.status, endedAtMs: r.endedAt?.toMillis() ?? null }, Date.now())) return false;
      tx.update(ref, { status: "failed", failReason: "egress" });
      return true;
    });
  }

  async function requestStop(id: string, r: RecDoc) {
    await recordingRef(id).update({ stopRequested: true });
    if (r.egressId) await egress.stop(r.egressId);
  }

  /** 방송이 방송 중으로 바뀌었을 때 부른다. 녹화를 켰으면 LiveKit에 녹화를 요청한다. 실패해도 던지지 않는다(방송은 계속된다). */
  async function start(broadcastId: string) {
    const bref = broadcastRef(broadcastId);
    const b = (await bref.get()).data() as { recordingEnabled?: boolean; recordingId?: string | null; ownerId: string; ownerNickname: string; title: string } | undefined;
    if (!b?.recordingEnabled || b.recordingId) return;
    const rref = db().collection("recordings").doc();
    const now = Timestamp.now();
    const base = {
      broadcastId,
      ownerId: b.ownerId,
      ownerNickname: b.ownerNickname,
      broadcastTitle: b.title,
      isPublic: false, // 처음은 비공개(4-9)
      storageKey: `recordings/${broadcastId}/${rref.id}.mp4`,
      durationMs: null,
      startedAt: now,
      stopRequested: false,
    };
    const fail = async (reason: "quota" | "error") => {
      await rref.create({ ...base, egressId: null, status: "failed", failReason: reason, endedAt: now });
      await bref.update({ recordingId: rref.id, recordingStartedAt: null, recordingFailReason: reason });
    };
    const month = usageMonth(now.toDate());
    try {
      // 3분을 미리 더한다. 끝나면 실제 길이로 고친다(4-9).
      const reserved = await db().runTransaction(async (tx) => {
        const used = ((await tx.get(usageRef(month))).data()?.usedMs as number | undefined) ?? 0;
        if (!canStartRecording(used)) return false;
        tx.set(usageRef(month), { usedMs: used + RECORDING_MAX_MS }, { merge: true });
        return true;
      });
      if (!reserved) return await fail("quota");
      let egressId: string;
      try {
        egressId = (await egress.startRoomComposite(broadcastId, base.storageKey)).egressId;
      } catch (e) {
        console.error("recording start", e);
        await usageRef(month).set({ usedMs: FieldValue.increment(-RECORDING_MAX_MS) }, { merge: true });
        return await fail("error");
      }
      await rref.create({ ...base, egressId, status: "recording", endedAt: null });
      await bref.update({ recordingId: rref.id, recordingStartedAt: now, recordingFailReason: null });
      // 요청하는 사이에 방송이 끝났다면 종료 함수가 이 녹화를 보지 못했다. 여기서 처리 중으로 넘긴다.
      if (((await bref.get()).data() as { status: string }).status === "ended") {
        await rref.update({ status: "processing", endedAt: Timestamp.now() });
        await egress.stop(egressId);
      }
    } catch (e) {
      console.error("recording start", e); // 녹화가 못 돼도 방송은 계속된다
    }
  }

  async function ownedRecording(viewer: Viewer, id: string) {
    const snap = await recordingRef(id).get();
    if (!snap.exists) throw notFound("녹화를 찾을 수 없어요");
    const r = snap.data() as RecDoc;
    if (r.ownerId !== viewer.uid) throw forbidden();
    return r;
  }

  async function removeRecording(id: string, r: RecDoc) {
    await removeFile(r.storageKey);
    await recordingRef(id).delete();
    await broadcastRef(r.broadcastId).update({ recordingId: null }).catch(() => undefined); // 방송이 이미 없어도 된다
  }

  return {
    start,
    failIfStale,

    /** 방송 삭제가 지우기 전에 부른다. 녹화가 처리 중이면 거절하고, 아니면 파일과 녹화 정보를 지운다. */
    async removeForBroadcast(recordingId: string) {
      await failIfStale(recordingId);
      const snap = await recordingRef(recordingId).get();
      if (!snap.exists) return;
      const r = snap.data() as RecDoc;
      if (isBusy(r.status)) throw conflict("RECORDING_PROCESSING", "다시보기를 만드는 중이에요. 다 된 뒤에 지울 수 있어요");
      await removeFile(r.storageKey);
      await recordingRef(recordingId).delete();
    },

    /** 방송 중이고 녹화 중일 때만. 녹화 3분 제한(송출 화면이 부른다). 이미 멈췄으면 그대로 끝낸다. */
    async stopByOwner(viewer: Viewer, broadcastId: string) {
      const b = (await broadcastRef(broadcastId).get()).data() as { ownerId: string; status: string; recordingId?: string | null } | undefined;
      if (!b) throw notFound();
      if (b.ownerId !== viewer.uid) throw forbidden();
      if (b.status !== "live" || !b.recordingId) throw conflict("NOT_RECORDING", "녹화 중인 방송이 아니에요");
      const r = (await recordingRef(b.recordingId).get()).data() as RecDoc | undefined;
      if (r?.status === "recording" && !r.stopRequested) await requestStop(b.recordingId, r);
    },

    /** 종료·채팅·시청 권한 요청 때 3분이 지났으면 녹화를 멈춘다(결정 28). 실패해도 요청은 계속한다. */
    async enforceLimit(recordingId: string | null | undefined) {
      if (!recordingId) return;
      try {
        const r = (await recordingRef(recordingId).get()).data() as RecDoc | undefined;
        if (r && shouldStopRecording({ status: r.status, startedAtMs: r.startedAt.toMillis(), stopRequested: r.stopRequested }, Date.now())) {
          await requestStop(recordingId, r);
        }
      } catch (e) {
        console.error("recording enforceLimit", e);
      }
    },

    /** LiveKit "녹화가 끝났다" 알림(7장). 파일이 있으면 볼 수 있음, 없거나 오류면 실패. 녹화 정보가 없거나 이미 닫혔으면 파일을 지운다. */
    async onEgressEnded(info: EgressInfo) {
      const file = info.fileResults[0];
      const key = file?.filename || undefined;
      const ok = !!key && info.status !== EgressStatus.EGRESS_FAILED && info.status !== EgressStatus.EGRESS_ABORTED;
      const durationMs = file ? Number(file.duration / 1_000_000n) : 0; // 나노초 → 밀리초
      const found = await db().collection("recordings").where("egressId", "==", info.egressId).limit(1).get();
      const doc = found.docs[0];
      if (!doc) return removeFile(key); // 주인 없는 파일

      const keep = await db().runTransaction(async (tx) => {
        const r = (await tx.get(doc.ref)).data() as RecDoc;
        if (r.status !== "recording" && r.status !== "processing") return false; // 이미 실패로 닫혔거나 처리가 끝났다
        tx.update(doc.ref, {
          status: ok ? "ready" : "failed",
          ...(!ok && { failReason: "egress" }),
          durationMs: ok ? durationMs : null,
          endedAt: r.endedAt ?? Timestamp.now(),
          ...(key && { storageKey: key }),
        });
        if (ok) tx.set(usageRef(usageMonth(r.startedAt.toDate())), { usedMs: FieldValue.increment(usageCorrection(durationMs)) }, { merge: true });
        return ok;
      });
      if (!keep) await removeFile(key);
    },

    /** 다시보기 목록: 볼 수 있고 공개한 녹화, 최근 순(4-9). */
    async listPublic() {
      const snap = await db().collection("recordings").where("isPublic", "==", true).where("status", "==", "ready").orderBy("startedAt", "desc").limit(50).get();
      return snap.docs.map((d) => toRecording(d.id, d.data() as RecDoc));
    },

    /** 다시보기 하나. 볼 수 없으면(없음, 비공개, 아직 안 만들어짐) 모두 같은 404로 답한다. */
    async getReplay(viewerUid: string | null, id: string) {
      const snap = await recordingRef(id).get();
      const r = snap.data() as RecDoc | undefined;
      if (!r || !canPlay(r, viewerUid)) throw notFound(NOT_PLAYABLE);
      const b = ((await broadcastRef(r.broadcastId).get()).data() ?? {}) as { sourceType?: string; donationTotal?: number; donationCount?: number };
      return {
        recording: toRecording(id, r),
        playUrl: await storage.signedGetUrl(r.storageKey, PLAY_URL_TTL_SEC),
        broadcast: { sourceType: b.sourceType ?? "screen", donationTotal: b.donationTotal ?? 0, donationCount: b.donationCount ?? 0 },
      };
    },

    /** 종료된 방송 화면의 "다시보기" 버튼: 공개 녹화가 있을 때만 ID를 준다. */
    async publicRecordingOf(broadcastId: string) {
      const b = (await broadcastRef(broadcastId).get()).data() as { recordingId?: string | null } | undefined;
      if (!b?.recordingId) return null;
      const r = (await recordingRef(b.recordingId).get()).data() as RecDoc | undefined;
      return r && r.status === "ready" && r.isPublic ? b.recordingId : null;
    },

    async setPublic(viewer: Viewer, id: string, isPublic: boolean) {
      const r = await ownedRecording(viewer, id);
      if (r.status !== "ready") throw conflict("NOT_READY", "다시보기가 만들어진 뒤에 바꿀 수 있어요");
      await recordingRef(id).update({ isPublic });
    },

    /** 녹화 삭제. 녹화 중이거나 처리 중이면 거절한다. */
    async remove(viewer: Viewer, id: string) {
      await ownedRecording(viewer, id);
      await failIfStale(id);
      const r = (await recordingRef(id).get()).data() as RecDoc;
      if (isBusy(r.status)) throw conflict("RECORDING_BUSY", "녹화 중이거나 처리 중인 녹화는 지울 수 없어요");
      await removeRecording(id, r);
    },

    /** 내 방송 관리(4-10). 열 때 30분 넘은 "처리 중"을 실패로 바꾸고, 끝난 방송과 후원을 모아 준다. */
    async studio(viewer: Viewer) {
      const uid = viewer.uid;
      const stale = await db().collection("recordings").where("ownerId", "==", uid).where("status", "==", "processing").get();
      await Promise.all(stale.docs.map((d) => failIfStale(d.id)));

      // shortcut: 방송 200개, 후원 500건까지만 읽는다. 더 많아지면 쪽 나누기를 붙인다.
      const [bSnap, dSnap] = await Promise.all([
        db().collection("broadcasts").where("ownerId", "==", uid).orderBy("createdAt", "desc").limit(200).get(),
        db().collection("donations").where("streamerId", "==", uid).orderBy("createdAt", "desc").limit(500).get(),
      ]);
      const alive = new Set(bSnap.docs.map((d) => d.id));
      const endedDocs = bSnap.docs.filter((d) => d.data().status === "ended").sort((a, b) => (b.data().endedAt?.toMillis() ?? 0) - (a.data().endedAt?.toMillis() ?? 0));

      const recIds = [...new Set(endedDocs.map((d) => d.data().recordingId as string | null | undefined).filter((x): x is string => !!x))];
      const recSnaps = recIds.length ? await db().getAll(...recIds.map(recordingRef)) : [];
      const recs = new Map(recSnaps.filter((s) => s.exists).map((s) => [s.id, toRecording(s.id, s.data() as RecDoc)]));

      const donations = dSnap.docs.map((d): StudioDonation => {
        const x = d.data();
        return {
          id: d.id,
          broadcastId: x.broadcastId,
          broadcastTitle: x.broadcastTitle ?? "",
          donor: x.anonymous ? "익명" : (x.donorNickname ?? ""),
          amount: x.amount ?? 0,
          delivered: x.delivered ?? 0,
          shareRate: x.shareRate ?? 0,
          earning: x.streamerEarning ?? 0,
          createdAt: iso(x.createdAt as Timestamp)!,
        };
      });
      const by = new Map<string, StudioDonation[]>();
      for (const d of donations) by.set(d.broadcastId, [...(by.get(d.broadcastId) ?? []), d]);

      const ended: StudioItem[] = endedDocs.map((d) => {
        const x = d.data();
        const list = by.get(d.id) ?? [];
        return {
          broadcast: {
            id: d.id,
            ownerId: x.ownerId,
            ownerNickname: x.ownerNickname,
            title: x.title,
            sourceType: x.sourceType,
            status: x.status,
            createdAt: iso(x.createdAt)!,
            startedAt: iso(x.startedAt),
            endedAt: iso(x.endedAt),
          },
          recording: recs.get(x.recordingId ?? "") ?? null,
          donationTotal: list.reduce((s, v) => s + v.delivered, 0),
          donations: list,
        };
      });
      return { ended, deletedDonations: donations.filter((d) => !alive.has(d.broadcastId)) };
    },
  };
}
export type RecordingUseCases = ReturnType<typeof recordingUseCases>;
