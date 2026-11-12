import { EgressClient, EncodedFileOutput, EncodedFileType, S3Upload } from "livekit-server-sdk";
import { storageConfig } from "./storage.ts";

/** LiveKit 방 합성 녹화(egress). 방 전체를 바둑판형으로 합쳐 MP4 한 파일로 저장소에 올린다(4-9). */
export interface EgressPort {
  /** 녹화를 요청하고 LiveKit 녹화 ID를 돌려준다. 받아들이지 못하면 던진다. */
  startRoomComposite(room: string, filepath: string): Promise<{ egressId: string }>;
  /** 이미 끝난 녹화여도 오류로 보지 않는다 */
  stop(egressId: string): Promise<void>;
}

export function createEgress(): EgressPort {
  const url = (process.env.LIVEKIT_URL ?? "ws://localhost:7880").replace(/^ws/, "http");
  const client = new EgressClient(url, process.env.LIVEKIT_API_KEY ?? "devkey", process.env.LIVEKIT_API_SECRET ?? "secret");
  return {
    async startRoomComposite(room, filepath) {
      const s = storageConfig();
      const file = new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath,
        output: {
          case: "s3",
          value: new S3Upload({
            accessKey: s.accessKeyId,
            secret: s.secretAccessKey,
            region: s.region,
            endpoint: s.egressEndpoint,
            bucket: s.bucket,
            forcePathStyle: true,
          }),
        },
      });
      const info = await client.startRoomCompositeEgress(room, file, { layout: "grid" });
      return { egressId: info.egressId };
    },
    async stop(egressId) {
      await client.stopEgress(egressId).catch(() => undefined);
    },
  };
}

/** 확인용 가짜 egress. 요청을 기억만 하고, failStart를 켜면 시작이 거절된다. */
export function createFakeEgress() {
  const started: { egressId: string; room: string; filepath: string }[] = [];
  const stopped: string[] = [];
  const fake = {
    started,
    stopped,
    failStart: false,
    async startRoomComposite(room: string, filepath: string) {
      if (fake.failStart) throw new Error("fake egress: 시작 거절");
      const egressId = `EG_fake_${crypto.randomUUID()}`;
      started.push({ egressId, room, filepath });
      return { egressId };
    },
    async stop(egressId: string) {
      stopped.push(egressId);
    },
  } satisfies EgressPort & Record<string, unknown>;
  return fake;
}
