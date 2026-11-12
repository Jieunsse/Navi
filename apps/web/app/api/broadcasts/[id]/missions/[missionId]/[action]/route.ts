import { livekit, requireUser } from "@nabi/core";
import { notFound } from "@nabi/core/errors.ts";
import { missionUseCases } from "@nabi/core/application/mission.ts";
import { honeyApi, missionActionSchema } from "@nabi/shared/honey.ts";
import { authHeader, route } from "@/server/route";

// 수락·거절·성공·실패는 방송자만, 마감 처리 요청(expire)은 누구나 부를 수 있다. 서버가 마감 시각을 확인한다(5장).
export const POST = route(honeyApi.missionAction, async ({ req, params }) => {
  const action = missionActionSchema.safeParse(params.action);
  if (!action.success) throw notFound("미션을 찾을 수 없어요");
  const viewer = action.data === "expire" ? null : await requireUser(authHeader(req));
  return missionUseCases(livekit()).act(viewer, params.id!, params.missionId!, action.data);
});
