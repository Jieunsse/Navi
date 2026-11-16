"use client";
import { fillPath, type ApiErrorBody, type ApiReq, type ApiRes, type Contract } from "@nabi/shared";
import { auth } from "@/shared/lib/firebase";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** API 약속 하나로 요청한다. 로그인 토큰을 붙이고 오류 모양을 맞춘다(결정 18). */
export async function apiFetch<C extends Contract>(c: C, input?: ApiReq<C>, params?: Record<string, string>): Promise<ApiRes<C>> {
  const token = await auth.currentUser?.getIdToken();
  const hasBody = c.method !== "GET" && c.method !== "DELETE";
  let res: Response;
  try {
    const query = c.method === "GET" && input ? new URLSearchParams(Object.entries(input as Record<string, unknown>).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)])).toString() : "";
    res = await fetch(fillPath(c.path, params) + (query && `?${query}`), {
      method: c.method,
      headers: { ...(hasBody && { "content-type": "application/json" }), ...(token && { authorization: `Bearer ${token}` }) },
      body: hasBody ? JSON.stringify(input ?? {}) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "연결이 불안정해요. 다시 시도해 주세요");
  }
  const data = (await res.json().catch(() => null)) as (ApiRes<C> & Partial<ApiErrorBody>) | null;
  if (res.status === 401 && data?.error?.code === "SIGNUP_INCOMPLETE") goSignupGoogle();
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "UNKNOWN", data?.error?.message ?? "잠시 뒤에 다시 시도해 주세요");
  return data as ApiRes<C>;
}

/** 구글로 로그인만 하고 가입을 마무리하지 않은 사람은 가입 마무리 화면으로 보낸다(4-1). */
function goSignupGoogle() {
  const { pathname, search } = location;
  if (pathname.startsWith("/signup/google")) return;
  // 로그인 화면에서 막혔다면 로그인 화면이 아니라 로그인 뒤에 가려던 곳으로 돌아오게 한다.
  const next = pathname === "/login" ? (new URLSearchParams(search).get("next") ?? "/") : pathname + search;
  location.assign(`/signup/google?next=${encodeURIComponent(next)}`);
}
