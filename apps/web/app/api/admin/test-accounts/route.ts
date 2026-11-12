import { requireAdmin } from "@nabi/core/application/admin.ts";
import { seedApi } from "@nabi/shared/seed.ts";
import { authHeader, route } from "@/server/route";
import { seedServer } from "@/server/seed";

export const GET = route(seedApi.adminList, async ({ req }) => seedServer().list(await requireAdmin(authHeader(req))));
