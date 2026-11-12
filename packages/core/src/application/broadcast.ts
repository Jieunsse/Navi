import { findBannedWord, type Broadcast, type SourceType } from "@nabi/shared";
import { db, FieldValue, iso, Timestamp } from "../adapters/firebase.ts";
import type { LiveKitPort } from "../adapters/livekit.ts";
import { endStats, hostIdentity, overTestLimit } from "../domain/broadcast.ts";
import { badRequest, conflict, forbidden, notFound } from "../errors.ts";
import type { Viewer } from "./auth.ts";
import { assertCanBroadcast } from "./moderation.ts";
import { recordingRef, type RecordingUseCases } from "./recording.ts";

type BroadcastDoc = Omit<Broadcast, "id" | "createdAt" | "startedAt" | "endedAt"> & {
  createdAt: Timestamp;
  startedAt: Timestamp | null;
  endedAt: Timestamp | null;
  roomName: string;
  recordingEnabled?: boolean;
  recordingId?: string | null; // 방송 시작 때 만든 녹화 문서(4-9)
};

const col = () => db().collection("broadcasts");

function toBroadcast(id: string, d: BroadcastDoc): Broadcast {
  return {
    id,
    ownerId: d.ownerId,
    ownerNickname: d.ownerNickname,
    title: d.title,
    sourceType: d.sourceType,
    status: d.status,
    createdAt: iso(d.createdAt)!,
    startedAt: iso(d.startedAt),
    endedAt: iso(d.endedAt),
  };
}

async function load(id: string) {
  const snap = await col().doc(id).get();
  if (!snap.exists) throw notFound();
  return snap.data() as BroadcastDoc;
}

async function loadOwned(viewer: Viewer, id: string) {
  const b = await load(id);
  if (b.ownerId !== viewer.uid) throw forbidden();
  return b;
}

function assertTitle(title: string) {
  if (findBannedWord(title)) throw badRequest("TITLE_BANNED", "제목에 쓸 수 없는 말이 들어 있어요");
}

export function broadcastUseCases(livekit: LiveKitPort, recordings: RecordingUseCases) {
  /** 방송 종료는 이 함수 하나가 처리한다(07 3장). 방송 중일 때만 바꾸고, 두 번 불려도 한 번만 처리한다. */
  async function end(id: string) {
    const ref = col().doc(id);
    // 녹화 3분이 지났는데 아직 안 멈췄다면 먼저 멈춘다(결정 28). 트랜잭션 뒤에는 "처리 중"이라 멈춤 대상이 아니다.
    await recordings.enforceLimit(((await ref.get()).data() as BroadcastDoc | undefined)?.recordingId);
    const ended = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const b = snap.data() as BroadcastDoc | undefined;
      if (!b || b.status !== "live") return false;
      const recRef = b.recordingId ? recordingRef(b.recordingId) : null;
      const rec = recRef ? (await tx.get(recRef)).data() : undefined;
      const endedAt = Timestamp.now();
      const { durationMs, counted } = endStats(b.startedAt?.toDate() ?? null, endedAt.toDate());
      tx.update(ref, { status: "ended", endedAt });
      // 같은 트랜잭션에서 "녹화 중"을 "처리 중"으로 바꾼다(07 3장 2번)
      if (recRef && rec?.status === "recording") tx.update(recRef, { status: "processing", endedAt });
      tx.update(db().collection("users").doc(b.ownerId), {
        broadcastCount: FieldValue.increment(counted),
        totalBroadcastMs: FieldValue.increment(durationMs),
      });
      return true;
    });
    // 준비 상태 방송은 시청자만 나가도 방이 닫히므로 건드리지 않는다(07 3장).
    if (ended) await livekit.closeRoom(id);
    return ended;
  }

  /** 송출이 실제로 올라왔으면 준비 → 방송 중. 송출 확인 요청과 웹훅 중 먼저 온 쪽이 바꾼다. */
  async function confirmLive(id: string) {
    const b = await load(id);
    if (b.status !== "ready") return b.status;
    if (!(await livekit.isPublishing(id, hostIdentity(b.ownerId)))) return "ready" as const;
    const ref = col().doc(id);
    let flipped = false;
    const status = await db().runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data() as BroadcastDoc | undefined;
      if (!cur) throw notFound();
      if (cur.status !== "ready") return cur.status;
      tx.update(ref, { status: "live", startedAt: Timestamp.now() });
      flipped = true;
      return "live" as const;
    });
    // 방송 중으로 바꾼 쪽만 녹화를 시작한다. 실패해도 방송은 계속된다(4-9).
    if (flipped) await recordings.start(id);
    return status;
  }

  /** 테스트 방송자의 30분 제한. 넘었으면 끝내고 true. */
  async function enforceTestLimit(id: string, b: BroadcastDoc) {
    if (!overTestLimit(b.ownerId, b.status, b.startedAt?.toDate() ?? null, new Date())) {
      await recordings.enforceLimit(b.recordingId); // 채팅·시청 권한 요청 때 녹화 3분도 확인한다(결정 28)
      return false;
    }
    await end(id);
    return true;
  }

  return {
    end,
    enforceTestLimit: async (id: string) => enforceTestLimit(id, await load(id)),

    async create(viewer: Viewer, input: { title: string; sourceType: SourceType }) {
      await assertCanBroadcast(viewer.uid);
      assertTitle(input.title);
      const ref = col().doc();
      await ref.create({
        ownerId: viewer.uid,
        ownerNickname: viewer.user.nickname,
        title: input.title,
        sourceType: input.sourceType,
        status: "ready",
        recordingEnabled: false,
        roomName: ref.id, // 방 이름은 방송 ID와 같다(결정 30)
        donationTotal: 0,
        donationCount: 0,
        createdAt: Timestamp.now(),
        startedAt: null,
        endedAt: null,
      });
      return { id: ref.id };
    },

    async get(id: string) {
      return toBroadcast(id, await load(id));
    },

    async update(viewer: Viewer, id: string, title: string) {
      assertTitle(title);
      const b = await loadOwned(viewer, id);
      await col().doc(id).update({ title });
      if (b.recordingId) await recordingRef(b.recordingId).update({ broadcastTitle: title }).catch(() => undefined);
    },

    async remove(viewer: Viewer, id: string) {
      const b = await loadOwned(viewer, id);
      if (b.status === "live") throw conflict("BROADCAST_LIVE", "방송 중에는 지울 수 없어요. 방송을 끝낸 뒤 지워 주세요");
      // 녹화가 처리 중이면 거절한다. 아니면 파일과 녹화 정보를 지운다(4-10). 후원 기록은 그대로 둔다.
      if (b.recordingId) await recordings.removeForBroadcast(b.recordingId);
      await db().recursiveDelete(col().doc(id)); // 채팅 등 하위 문서도 함께 지운다
      if (b.status === "ready") await livekit.closeRoom(id);
    },

    async listMine(viewer: Viewer) {
      const snap = await col().where("ownerId", "==", viewer.uid).orderBy("createdAt", "desc").limit(100).get();
      return snap.docs.map((d) => toBroadcast(d.id, d.data() as BroadcastDoc));
    },

    /** 송출용 접속 권한은 준비 상태 방송에만 준다(결정 30). */
    async publishToken(viewer: Viewer, id: string, recordingEnabled = false) {
      await assertCanBroadcast(viewer.uid);
      const b = await loadOwned(viewer, id);
      if (b.status === "live") throw conflict("ALREADY_LIVE", "이미 방송 중인 방송이에요. 송출 화면에 다시 들어갈 수 없어요");
      if (b.status === "ended") throw conflict("ENDED", "이미 끝난 방송이에요");
      // 녹화 여부는 방송을 시작하는 이 요청에서 정한다(결정 24)
      await col().doc(id).update({ recordingEnabled });
      return { token: await livekit.token(id, hostIdentity(viewer.uid), true), url: livekit.url };
    },

    confirmLive,

    async confirmLiveByOwner(viewer: Viewer, id: string) {
      await loadOwned(viewer, id);
      return confirmLive(id);
    },

    async endByOwner(viewer: Viewer, id: string) {
      await loadOwned(viewer, id);
      await end(id);
    },

    async viewerToken(id: string) {
      const b = await load(id);
      if (b.status === "ended" || (await enforceTestLimit(id, b))) throw conflict("ENDED", "방송이 끝났어요");
      return { token: await livekit.token(id, `viewer_${crypto.randomUUID()}`, false), url: livekit.url };
    },

    /** LiveKit 웹훅(07 7장). 방 이름이 방송 ID다. */
    async onLiveKitEvent(event: { event: string; room?: { name: string }; participant?: { identity: string } }) {
      const id = event.room?.name;
      const identity = event.participant?.identity ?? "";
      if (!id) return;
      if (event.event === "track_published" && identity.startsWith("host_")) {
        const b = await load(id).catch(() => null);
        if (b && identity === hostIdentity(b.ownerId)) await confirmLive(id);
      } else if (event.event === "participant_left" && identity.startsWith("host_")) {
        // 같은 이름으로 다시 연결해 방에 있으면 끝내지 않는다(결정 27).
        if (!(await livekit.isInRoom(id, identity))) await end(id);
      } else if (event.event === "room_finished") {
        await end(id);
      }
    },
  };
}
