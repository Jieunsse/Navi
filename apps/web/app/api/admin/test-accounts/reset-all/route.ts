import { requireAdmin } from "@nabi/core/application/admin.ts";
import { seedApi } from "@nabi/shared/seed.ts";
import { authHeader, route } from "@/server/route";
import { seedServer } from "@/server/seed";

export const maxDuration = 60; // 전체 초기화는 수십 초 걸릴 수 있다

// 전체 초기화: 운영자만 할 수 있고, 테스트 운영자는 10분에 한 번이다(서버가 확인한다).
export const POST = route(seedApi.adminFullReset, async ({ req }) => seedServer().fullReset(await requireAdmin(authHeader(req))));
