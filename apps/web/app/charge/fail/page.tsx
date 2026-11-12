"use client";
import { honeyApi } from "@nabi/shared/honey.ts";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { useSession } from "@/entities/session/session";
import { apiFetch } from "@/shared/api/apiFetch";
import { Button, Center, Notice } from "@/shared/ui";

export default function ChargeFailPage() {
  return (
    <Suspense>
      <Fail />
    </Suspense>
  );
}

function Fail() {
  const params = useSearchParams();
  const { me } = useSession();
  const sent = useRef(false);
  const orderId = params?.get("orderId");
  const next = params?.get("next");
  const back = next?.startsWith("/") && !next.startsWith("//") ? next : "/me/honey";

  useEffect(() => {
    // 결제 대기를 실패로 닫아 오늘 한도를 되돌린다.
    if (me && orderId && !sent.current) {
      sent.current = true;
      void apiFetch(honeyApi.failCharge, { orderId }).catch(() => undefined);
    }
  }, [me, orderId]);

  return (
    <Center>
      <p className="text-lg font-bold">결제하지 못했어요</p>
      <Notice tone="danger">{params?.get("message") ?? "결제가 취소되었거나 실패했어요"}</Notice>
      <p className="text-sm text-muted">꿀은 들어가지 않았어요</p>
      <Link href={back}><Button>원래 화면으로 돌아가기</Button></Link>
    </Center>
  );
}
