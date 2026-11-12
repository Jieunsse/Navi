import { broadcasts } from "@nabi/core";
import { api } from "@nabi/shared";
import { route } from "@/server/route";

export const POST = route(api.viewerToken, async ({ params }) => broadcasts().viewerToken(params.id!));
