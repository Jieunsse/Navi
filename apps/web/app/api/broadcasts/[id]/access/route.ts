import { broadcasts, livekit, requireUser } from "@nabi/core";
import { chatUseCases } from "@nabi/core/application/chat.ts";
import { chatApi } from "@nabi/shared/chat.ts";
import { authHeader, route } from "@/server/route";

// 로그인하지 않아도 부를 수 있다. 로그인 토큰이 없거나 틀리면 비로그인으로 본다.
export const GET = route(chatApi.broadcastAccess, async ({ req, params }) => {
  const uid = await requireUser(authHeader(req)).then((v) => v.uid, () => null);
  return chatUseCases(livekit(), broadcasts().enforceTestLimit).access(uid, params.id!);
});
