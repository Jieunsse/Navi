import { requireAdmin } from "@nabi/core/application/admin.ts";
import { seedApi } from "@nabi/shared/seed.ts";
import { authHeader, route } from "@/server/route";
import { seedServer } from "@/server/seed";

// 부분 초기화: 운영자(실제, 테스트)만 할 수 있다.
export const POST = route(seedApi.adminPartialReset, async ({ req, body }) => seedServer().partialReset(await requireAdmin(authHeader(req)), body.target));
