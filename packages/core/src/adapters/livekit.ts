import { AccessToken, DataPacket_Kind, RoomServiceClient, WebhookReceiver, type WebhookEvent } from "livekit-server-sdk";

export interface LiveKitPort {
  url: string;
  token(room: string, identity: string, canPublish: boolean): Promise<string>;
  /** 그 참가자가 방에 있고 트랙을 하나 이상 올렸는가 */
  isPublishing(room: string, identity: string): Promise<boolean>;
  isInRoom(room: string, identity: string): Promise<boolean>;
  /** 방에 있는 시청자(이름이 viewer_로 시작) 수. 방이 없으면 0. 매번 목록을 받아 새로 센다 */
  countViewers(room: string): Promise<number>;
  /** 방이 없어도 오류로 보지 않는다(결정 30) */
  closeRoom(room: string): Promise<void>;
  receiveWebhook(body: string, auth: string | null): Promise<WebhookEvent>;
  /** 서버가 방 전체에 JSON을 보낸다. 주제는 chat, donation, mission(4-7). 실패하면 한 번 다시 보낸다. 방이 없으면 조용히 끝낸다. */
  send(room: string, topic: "chat" | "donation" | "mission", payload: unknown): Promise<void>;
}

export function createLiveKit(): LiveKitPort {
  const url = process.env.LIVEKIT_URL ?? "ws://localhost:7880";
  const key = process.env.LIVEKIT_API_KEY ?? "devkey";
  const secret = process.env.LIVEKIT_API_SECRET ?? "secret";
  const rooms = new RoomServiceClient(url.replace(/^ws/, "http"), key, secret);
  const receiver = new WebhookReceiver(key, secret);
  const participant = (room: string, identity: string) => rooms.getParticipant(room, identity).catch(() => null);

  return {
    url: process.env.NEXT_PUBLIC_LIVEKIT_URL ?? url,
    async token(room, identity, canPublish) {
      const at = new AccessToken(key, secret, { identity, ttl: "6h" });
      // 브라우저는 데이터를 직접 보내지 못한다. 채팅은 서버만 보낸다(4-7).
      at.addGrant({ room, roomJoin: true, canPublish, canSubscribe: true, canPublishData: false });
      return at.toJwt();
    },
    async isPublishing(room, identity) {
      const p = await participant(room, identity);
      return !!p && p.tracks.length > 0;
    },
    async isInRoom(room, identity) {
      return !!(await participant(room, identity));
    },
    async countViewers(room) {
      const list = await rooms.listParticipants(room).catch(() => []);
      return list.filter((p) => p.identity.startsWith("viewer_")).length;
    },
    async closeRoom(room) {
      await rooms.deleteRoom(room).catch(() => undefined);
    },
    receiveWebhook: (body, auth) => receiver.receive(body, auth ?? undefined),
    async send(room, topic, payload) {
      const data = new TextEncoder().encode(JSON.stringify(payload));
      const once = () => rooms.sendData(room, data, DataPacket_Kind.RELIABLE, { topic });
      await once().catch(() => once()).catch(() => undefined);
    },
  };
}
