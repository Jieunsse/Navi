import { broadcasts, livekit, requireUser } from "@nabi/core";
import { chatUseCases } from "@nabi/core/application/chat.ts";
import { chatApi } from "@nabi/shared/chat.ts";
import { authHeader, route } from "@/server/route";

export const POST = route(chatApi.sendChat, async ({ req, body, params }) =>
  chatUseCases(livekit(), broadcasts().enforceTestLimit).send(await requireUser(authHeader(req)), params.id!, body),
);
