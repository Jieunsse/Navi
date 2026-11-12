import { AppError } from "../errors.ts";
import type { TossPayment, TossPort } from "./toss.ts";

/** 시드 결제(4-18). 토스를 부르지 않고 승인 요청을 그대로 "완료"로 돌려준다. 결제 키는 이 안에서만 기억한다. */
export function createSeedToss(): TossPort {
  const paid = new Map<string, TossPayment>();
  const find = (key: string) => {
    const p = paid.get(key);
    if (!p) throw new AppError(404, "NOT_FOUND_PAYMENT", "시드 결제를 찾을 수 없어요");
    return p;
  };
  return {
    async confirm(paymentKey, orderId, amount) {
      const p: TossPayment = { paymentKey, orderId, status: "DONE", totalAmount: amount };
      paid.set(paymentKey, p);
      return p;
    },
    async get(paymentKey) {
      return find(paymentKey);
    },
    async cancel(paymentKey) {
      const p: TossPayment = { ...find(paymentKey), status: "CANCELED" };
      paid.set(paymentKey, p);
      return p;
    },
  };
}
