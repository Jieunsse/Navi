"use client";
import { honeyApi } from "@nabi/shared/honey.ts";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRequireLogin } from "@/entities/session/session";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { Button, Center, Notice } from "@/shared/ui";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "done"; honey: number; returnTo: string | null; note?: string };

export default function ChargeSuccessPage() {
  return (
    <Suspense>
      <Success />
    </Suspense>
  );
}

function Success() {
  const params = useSearchParams();
  const { me } = useRequireLogin();
  const [state, setState] = useState<State>({ kind: "loading" });
  const started = useRef(false);

  useEffect(() => {
    if (!me || started.current) return;
    started.current = true;
    // 서버가 금액을 주문과 맞춰 보고 승인한 뒤 다시 조회해서 확정한다. 두 번 불러도 꿀은 한 번만 들어간다.
    apiFetch(honeyApi.confirmCharge, { paymentKey: params?.get("paymentKey") ?? "", orderId: params?.get("orderId") ?? "", amount: Number(params?.get("amount")) })
      .then((r) => setState({ kind: "done", honey: r.honey, returnTo: r.returnTo, note: r.donation.status === "done" ? "후원도 보냈어요" : r.donation.reason }))
      .catch((e) => setState({ kind: "error", message: e instanceof ApiError ? e.message : "충전을 확인하지 못했어요" }));
  }, [me, params]);

  if (state.kind === "loading") return <Center><p className="text-muted">결제를 확인하고 있어요…</p></Center>;
  if (state.kind === "error") {
    return (
      <Center>
        <Notice tone="danger">{state.message}</Notice>
        <Link href="/me/honey" className="text-sm text-accent underline">내 꿀로 가기</Link>
      </Center>
    );
  }
  return (
    <Center>
      <p className="text-lg font-bold">{state.honey.toLocaleString("ko-KR")}꿀을 충전했어요</p>
      {state.note && <Notice tone="info">{state.note}</Notice>}
      <Link href={state.returnTo ?? "/me/honey"}><Button>{state.returnTo ? "원래 화면으로 돌아가기" : "내 꿀 보기"}</Button></Link>
    </Center>
  );
}
