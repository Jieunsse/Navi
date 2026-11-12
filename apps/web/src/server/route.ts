import "server-only";
import { AppError } from "@nabi/core";
import type { Contract } from "@nabi/shared";
import type { z } from "zod";

type Ctx<C extends Contract> = { req: Request; body: z.output<C["req"]>; params: Record<string, string> };

const fail = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status });

/** API 입구: 입력 검사 → 핸들러 → 응답을 약속 스키마로 걸러서 보낸다(결정 18). */
export function route<C extends Contract>(contract: C, fn: (ctx: Ctx<C>) => Promise<z.input<C["res"]>>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      const raw = contract.method === "GET" || contract.method === "DELETE" ? {} : await req.json().catch(() => ({}));
      const parsed = contract.req.safeParse(raw);
      if (!parsed.success) return fail(400, "INVALID", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요");
      const out = await fn({ req, body: parsed.data as z.output<C["req"]>, params: (await ctx?.params) ?? {} });
      return Response.json(contract.res.parse(out));
    } catch (e) {
      if (e instanceof AppError) return fail(e.status, e.code, e.message);
      console.error(e);
      return fail(500, "INTERNAL", "잠시 뒤에 다시 시도해 주세요");
    }
  };
}

export const authHeader = (req: Request) => req.headers.get("authorization");
export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
