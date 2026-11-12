import { assertCronSecret } from "@nabi/core/application/settlement.ts";
import { settlementApi } from "@nabi/shared/settlement.ts";
import { authHeader, route } from "@/server/route";
import { settlements } from "@/server/settlement";

// 예약 작업 실행기가 부르는 입구(4-12). 비밀 값(CRON_SECRET)을 Authorization: Bearer로 보낸 곳만 열린다.
export const GET = route(settlementApi.monthlyJob, async ({ req }) => {
  assertCronSecret(authHeader(req));
  return settlements().runScheduled();
});
