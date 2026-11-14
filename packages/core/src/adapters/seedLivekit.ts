import type { LiveKitPort } from "./livekit.ts";

/** 시드용 LiveKit. 송출과 방 알림을 건너뛴다(4-18). 시드 방송은 방이 없어서 아무것도 보내지 않는다. */
export function createSeedLiveKit(): LiveKitPort {
  return {
    url: "ws://seed.invalid",
    token: async () => "",
    isPublishing: async () => false,
    isInRoom: async () => false,
    countViewers: async () => 0,
    closeRoom: async () => undefined,
    receiveWebhook: async () => {
      throw new Error("시드용이라 웹훅을 받지 않아요");
    },
    send: async () => undefined,
  };
}
