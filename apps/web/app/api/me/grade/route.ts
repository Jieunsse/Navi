import { requireUser } from "@nabi/core";
import { myGrade } from "@nabi/core/application/grade.ts";
import { gradeApi } from "@nabi/shared/grade.ts";
import { authHeader, route } from "@/server/route";

export const GET = route(gradeApi.myGrade, async ({ req }) => myGrade(await requireUser(authHeader(req))));
