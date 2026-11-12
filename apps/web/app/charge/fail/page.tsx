"use client";
import { honeyApi } from "@nabi/shared/honey.ts";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { useSession } from "@/entities/session/session";
import { apiFetch } from "@/shared/api/apiFetch";
import { buttonCls, CircleAlertIcon } from "@/shared/ui";

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
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <CircleAlertIcon size={24} className="text-danger" />
      <div className="flex max-w-[480px] flex-col gap-2">
        <p className="text-heading-20">결제하지 못했어요</p>
        <p className="text-body-16 text-muted">{params?.get("message") ?? "결제가 취소되었거나 실패했어요"}. 꿀은 들어가지 않았어요</p>
        {params?.get("code") && <p className="text-caption-12 text-subtle">오류 코드 {params.get("code")}</p>}
      </div>
      <Link href={back} className={buttonCls()}>원래 화면으로 돌아가기</Link>
    </div>
  );
}
