import { AppError } from "../errors.ts";

export type TossPayment = { paymentKey: string; orderId: string; status: string; totalAmount: number };

/** 토스페이먼츠 결제 승인·조회(공식 문서: POST /v1/payments/confirm, GET /v1/payments/{paymentKey}). */
export interface TossPort {
  /** 주문번호를 멱등키로 보내서 같은 주문을 두 번 승인하지 않는다. 실패하면 AppError(코드는 토스 오류 코드). */
  confirm(paymentKey: string, orderId: string, amount: number): Promise<TossPayment>;
  get(paymentKey: string): Promise<TossPayment>;
  /**
   * 결제 전액 취소(POST /v1/payments/{paymentKey}/cancel). 현금영수증도 함께 취소된다.
   * 토스가 400·404로 분명히 거절하면 AppError(status 400·404), 서버 오류는 502, 시간 초과나 끊김은 AppError가 아닌 오류다(결과를 모른다, 4-8).
   */
  cancel(paymentKey: string, reason: string, idempotencyKey: string): Promise<TossPayment>;
}

const BASE = "https://api.tosspayments.com/v1/payments";

export function createToss(): TossPort {
  const secret = () => {
    const key = process.env.TOSS_SECRET_KEY;
    if (!key) throw new AppError(500, "TOSS_KEY_MISSING", "결제 설정이 아직 없어요");
    return `Basic ${Buffer.from(`${key}:`).toString("base64")}`; // 시크릿 키 뒤에 콜론
  };
  async function call(url: string, init: RequestInit) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000), headers: { authorization: secret(), "content-type": "application/json", ...init.headers } });
    const data = (await res.json().catch(() => ({}))) as Partial<TossPayment> & { code?: string; message?: string };
    if (!res.ok) throw new AppError(res.status >= 500 ? 502 : res.status === 404 ? 404 : 400, data.code ?? "TOSS_ERROR", data.message ?? "결제를 확인하지 못했어요");
    return data as TossPayment;
  }
  return {
    confirm: (paymentKey, orderId, amount) =>
      call(`${BASE}/confirm`, { method: "POST", headers: { "Idempotency-Key": orderId }, body: JSON.stringify({ paymentKey, orderId, amount }) }),
    get: (paymentKey) => call(`${BASE}/${encodeURIComponent(paymentKey)}`, { method: "GET" }),
    cancel: (paymentKey, reason, idempotencyKey) =>
      call(`${BASE}/${encodeURIComponent(paymentKey)}/cancel`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ cancelReason: reason }) }),
  };
}
