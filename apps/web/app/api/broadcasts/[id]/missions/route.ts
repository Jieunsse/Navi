import { livekit, requireUser } from "@nabi/core";
import { honey } from "@nabi/core/application/honey.ts";
import { missionUseCases } from "@nabi/core/application/mission.ts";
import { honeyApi } from "@nabi/shared/honey.ts";
import { authHeader, route } from "@/server/route";

export const GET = route(honeyApi.listMissions, async ({ req, params }) => ({
  items: await missionUseCases(livekit()).list(await requireUser(authHeader(req)), params.id!),
}));

export const POST = route(honeyApi.donateMission, async ({ req, body, params }) => honey().donateMission(await requireUser(authHeader(req)), params.id!, body));
