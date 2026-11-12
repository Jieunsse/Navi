"use client";
import { moderationApi, SANCTION_LABEL, type SanctionItem } from "@nabi/shared/moderation.ts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/entities/session/session";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";

function text(s: SanctionItem) {
  const until = s.endAt ? `${formatTime(s.endAt)}까지 ` : "";
  if (s.kind === "warning") return `운영정책 위반(${s.reason})으로 경고를 받았어요.`;
  if (s.kind === "suspend") return `운영정책 위반(${s.reason})으로 이용이 정지됐어요.`;
  return `운영정책 위반(${s.reason})으로 ${until}${s.kind === "chatBan" ? "채팅을" : "방송을"} 쓸 수 없어요.`;
}

/** 제재받은 사람에게 보이는 위쪽 안내 띠(4-15). 경고는 한 번 본 뒤 닫으면 끝난다. */
export function SanctionBanner() {
  const { me } = useSession();
  const [items, setItems] = useState<SanctionItem[]>([]);
  useEffect(() => {
    if (!me) return;
    let alive = true;
    void apiFetch(moderationApi.mySanctions).then((r) => alive && setItems(r.items.filter((s) => s.status === "active")), () => undefined);
    return () => {
      alive = false;
    };
  }, [me]);

  const shown = me ? items : [];
  if (!shown.length) return null;
  const hasWarning = shown.some((s) => s.kind === "warning");
  return (
    <div role="status" className="flex flex-col gap-1 border-b border-danger/50 bg-danger/10 px-4 py-2 text-sm">
      {shown.map((s) => (
        <p key={s.id}>
          <b>{SANCTION_LABEL[s.kind]}</b> · {text(s)}
        </p>
      ))}
      <div className="flex gap-3 text-xs">
        <Link href="/me/sanctions" className="underline">
          자세히 보기
        </Link>
        {hasWarning && (
          <button
            onClick={() => {
              void apiFetch(moderationApi.ackWarnings).then(() => setItems((a) => a.filter((s) => s.kind !== "warning")));
            }}
            className="underline"
          >
            확인했어요
          </button>
        )}
      </div>
    </div>
  );
}
