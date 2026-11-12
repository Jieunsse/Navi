import { requireAdmin } from "@nabi/core/application/admin.ts";
import { settlementApi } from "@nabi/shared/settlement.ts";
import { authHeader, route } from "@/server/route";
import { settlements } from "@/server/settlement";

// 운영자인지와 환경 변수(ENABLE_SETTLEMENT_TEST)는 서버가 확인한다. 아니면 403이다.
export const POST = route(settlementApi.adminRunTest, async ({ req, body }) => settlements().runTest(await requireAdmin(authHeader(req)), body.requestId));
