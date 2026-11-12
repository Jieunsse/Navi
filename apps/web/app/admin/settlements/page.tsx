"use client";
import type { ApiRes } from "@nabi/shared";
import { settlementApi, statusText } from "@nabi/shared/settlement.ts";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminGate } from "@/features/admin/AdminGate";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button } from "@/shared/ui";

type Data = ApiRes<typeof settlementApi.adminList>;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");

function AdminSettlementsPageBody() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => apiFetch(settlementApi.adminList).then(setData, fail), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function runTest() {
    setBusy(true);
    try {
      // 요청 번호는 누를 때 브라우저가 만든다. 같은 번호가 두 번 가도 서버는 한 번만 처리한다.
      const r = await apiFetch(settlementApi.adminRunTest, { requestId: crypto.randomUUID() });
      toast.success(r.message);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function change(kind: "hold" | "release", userId: string) {
    const reason = prompt(kind === "hold" ? "정산을 보류하는 사유를 적어 주세요" : "보류를 해제하는 사유를 적어 주세요")?.trim();
    if (!reason) return;
    try {
      await apiFetch(kind === "hold" ? settlementApi.adminHold : settlementApi.adminRelease, { reason }, { userId });
      toast.success(kind === "hold" ? "정산을 보류했어요" : "보류를 해제했어요");
      await load();
    } catch (e) {
      fail(e);
    }
  }

  if (!data) return <p className="text-body-16 text-muted">불러오는 중…</p>;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-heading-28">정산 관리</h1>
        {data.testRunEnabled && (
          <Button onClick={runTest} loading={busy}>
            월 정산 지금 실행(테스트)
          </Button>
        )}
      </div>

      {data.holds.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-heading-16">정산을 보류한 방송자</h2>
          {data.holds.map((h) => (
            <div key={h.userId} className="flex items-center justify-between rounded-lg bg-surface p-4 text-body-16">
              <span>
                <b>{h.nickname}</b> <span className="text-caption-12 text-subtle">· 사유: {h.reason}</span>
              </span>
              <Button variant="secondary" className="h-8" disabled={h.masked} onClick={() => change("release", h.userId)}>
                보류 해제
              </Button>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-heading-16">정산 기록</h2>
        {data.items.length === 0 ? (
          <p className="text-body-16 text-muted">정산 기록이 없어요</p>
        ) : (
          <div className="overflow-x-auto rounded-lg bg-surface text-body-16">
            <table className="w-full min-w-[56rem] text-left">
              <thead className="text-caption-12 text-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">방송자</th>
                  <th className="px-3 py-2 font-medium">기록 번호</th>
                  <th className="px-3 py-2 font-medium">후원</th>
                  <th className="px-3 py-2 font-medium">지급액</th>
                  <th className="px-3 py-2 font-medium">상태</th>
                  <th className="px-3 py-2 font-medium">송금 번호</th>
                  <th className="px-3 py-2 font-medium">보류</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2">{s.streamerNickname}</td>
                    <td className="px-3 py-2 text-caption-12 text-subtle">
                      {s.id}
                      <span className="block">{s.mode === "test" ? "테스트 실행" : "예약 실행"} · {formatTime(s.createdAt)}</span>
                    </td>
                    <td className="px-3 py-2">
                      {s.donationCount}건
                      {s.hasSameIdentity && <span className="ml-1 rounded-xs bg-danger/10 px-1.5 py-0.5 text-badge-12 text-danger">같은 명의 포함</span>}
                    </td>
                    <td className="px-3 py-2">{won(s.payout)}</td>
                    <td className="px-3 py-2">
                      {statusText(s.status, s.mock)}
                      {s.holdReason && <span className="block text-caption-12 text-subtle">{s.holdReason}</span>}
                    </td>
                    <td className="px-3 py-2 text-caption-12 text-subtle">{s.transferId ?? "-"}</td>
                    <td className="px-3 py-2">
                      {s.streamerHeld ? (
                        <span className="text-caption-12 text-subtle">보류 중</span>
                      ) : (
                        <Button variant="ghost" className="h-8" disabled={s.masked} onClick={() => change("hold", s.streamerId)}>
                          정산 보류
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-heading-16">작업 실행 기록</h2>
        {data.runs.length === 0 && <p className="text-body-16 text-muted">실행 기록이 없어요</p>}
        {data.runs.map((r) => (
          <div key={r.id} className="rounded-lg bg-surface p-4 text-body-16">
            <p>
              <b>월 정산</b> · {r.mode === "test" ? "테스트" : "예약"} · 방송자 {r.streamerCount}명
            </p>
            <p className="text-caption-12 text-subtle">
              {formatTime(r.startedAt)}
              {r.adminNickname && ` · ${r.adminNickname}`} · {r.result}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}

// 운영자 틀은 layout.tsx 대신 각 화면이 둘러싼다. 레이아웃이 둘 이상이면 Next 개발 서버가 만드는 타입 파일이 타입 검사를 깨뜨린다.
export default function AdminSettlementsPage() {
  return (
    <AdminGate>
      <AdminSettlementsPageBody />
    </AdminGate>
  );
}
