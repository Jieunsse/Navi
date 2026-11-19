import { broadcasts, livekit, requireUser } from "@nabi/core";
import { chatUseCases } from "@nabi/core/application/chat.ts";
import { chatApi } from "@nabi/shared/chat.ts";
import { authHeader, route } from "@/server/route";

const chat = () => chatUseCases(livekit(), broadcasts().enforceTestLimit);

export const PATCH = route(chatApi.editChat, async ({ req, body, params }) =>
  chat().edit(await requireUser(authHeader(req)), params.id!, params.messageId!, body.content),
);

export const DELETE = route(chatApi.deleteChat, async ({ req, params }) => chat().remove(await requireUser(authHeader(req)), params.id!, params.messageId!));
