import { z } from "zod";
import { categorySchema } from "./category.ts";
import { broadcastSchema, meSchema, nicknameSchema, signupSchema, sourceTypeSchema, titleSchema } from "./schemas.ts";

// API 약속(결정 18). 화면은 apiFetch로, 서버는 route 헬퍼로 같은 약속을 쓴다.
export type Contract<Req extends z.ZodType = z.ZodType, Res extends z.ZodType = z.ZodType> = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string; // ":id" 자리는 params로 채운다
  req: Req;
  res: Res;
};
const c = <Req extends z.ZodType, Res extends z.ZodType>(method: Contract["method"], path: string, req: Req, res: Res) =>
  ({ method, path, req, res }) satisfies Contract<Req, Res>;

const none = z.object({});
const ok = z.object({ ok: z.literal(true) });
const livekitAccess = z.object({ token: z.string(), url: z.string() });

export const api = {
  signup: c("POST", "/api/auth/signup", signupSchema, ok),
  checkNickname: c("POST", "/api/auth/check-nickname", z.object({ nickname: nicknameSchema }), ok),
  testLogin: c("POST", "/api/auth/test-login", z.object({ account: z.enum(["broadcaster", "viewer", "admin"]) }), z.object({ token: z.string() })),
  me: c("GET", "/api/me", none, meSchema),

  createBroadcast: c("POST", "/api/broadcasts", z.object({ title: titleSchema, sourceType: sourceTypeSchema, withCamera: z.boolean().default(false), category: categorySchema.default("잡담") }), z.object({ id: z.string() })),
  getBroadcast: c("GET", "/api/broadcasts/:id", none, broadcastSchema),
  updateBroadcast: c("PATCH", "/api/broadcasts/:id", z.object({ title: titleSchema }), ok),
  deleteBroadcast: c("DELETE", "/api/broadcasts/:id", none, ok),
  myBroadcasts: c("GET", "/api/me/broadcasts", none, z.object({ items: z.array(broadcastSchema) })),

  publishToken: c("POST", "/api/broadcasts/:id/publish-token", z.object({ recordingEnabled: z.boolean().default(false) }), livekitAccess),
  confirmLive: c("POST", "/api/broadcasts/:id/confirm-live", none, z.object({ status: z.enum(["ready", "live", "ended"]) })),
  endBroadcast: c("POST", "/api/broadcasts/:id/end", none, ok),
  viewerToken: c("POST", "/api/broadcasts/:id/viewer-token", none, livekitAccess),
} as const;

export type ApiReq<C extends Contract> = z.input<C["req"]>;
export type ApiRes<C extends Contract> = z.output<C["res"]>;

export function fillPath(path: string, params: Record<string, string> = {}) {
  return path.replace(/:(\w+)/g, (_, k: string) => encodeURIComponent(params[k] ?? ""));
}

export type ApiErrorBody = { error: { code: string; message: string } };
