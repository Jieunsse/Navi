import { broadcasts, livekit } from "@nabi/core";
import { chatUseCases } from "@nabi/core/application/chat.ts";
import { chatApi } from "@nabi/shared/chat.ts";
import { route } from "@/server/route";

export const GET = route(chatApi.authorExample, async ({ params }) => chatUseCases(livekit(), broadcasts().enforceTestLimit).isExample(params.userId!));
