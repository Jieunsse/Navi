import { broadcasts, livekit } from "@nabi/core";
import { recordings } from "@nabi/core/container.ts";

// LiveKit 서버 알림(07 7장). 서명이 맞지 않으면 무시한다.
export async function POST(req: Request) {
  const body = await req.text();
  const event = await livekit()
    .receiveWebhook(body, req.headers.get("authorization"))
    .catch(() => null);
  if (!event) return new Response("invalid signature", { status: 401 });
  try {
    if (event.event === "egress_ended") {
      if (event.egressInfo) await recordings().onEgressEnded(event.egressInfo);
    } else await broadcasts().onLiveKitEvent(event);
  } catch (e) {
    console.error("livekit webhook", event.event, e);
  }
  return new Response("ok");
}
