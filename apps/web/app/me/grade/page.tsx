"use client";
import type { ApiRes } from "@nabi/shared";
import { GRADE_BENEFITS, GRADE_LABEL, GRADES, gradeApi, type Grade } from "@nabi/shared/grade.ts";
import { useEffect, useState } from "react";
import { useRequireLogin } from "@/entities/session/session";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Center, cx, HelpTip, Spinner, Tabs } from "@/shared/ui";

type Info = ApiRes<typeof gradeApi.myGrade>;
const HOUR_MS = 3_600_000;
const hoursText = (ms: number) => `${Math.floor((ms / HOUR_MS) * 10) / 10}`; // 소수 첫째 자리까지 내림

export default function GradePage() {
  const { me } = useRequireLogin();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Grade | null>(null);

  useEffect(() => {
    if (me) void apiFetch(gradeApi.myGrade).then(setInfo, (e) => setError(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요"));
  }, [me]);

  if (error) return <Center><p className="text-muted">{error}</p></Center>;
  if (!me || !info) return <div className="grid flex-1 place-items-center"><Spinner /></div>;

  const shown = tab ?? info.grade;
  const b = GRADE_BENEFITS[shown];
  return (
    <div className="flex w-full flex-col gap-8 px-4 py-6 md:p-8">
      <h1 className="text-heading-28">내 등급</h1>

      <section className="flex flex-col gap-4 rounded-lg bg-surface p-4 md:p-8">
        <div className="flex items-center gap-2">
          <GradeBadge grade={info.grade} />
          <h2 className="text-heading-20">{info.next ? `지금 등급은 ${GRADE_LABEL[info.grade]}이에요` : "가장 높은 등급이에요"}</h2>
          <HelpTip text={`후원의 ${info.sharePercent}%를 받아요`} />
        </div>
        {info.next && (
          <div className="grid gap-4 md:grid-cols-3 md:gap-6">
            <Progress label="방송 횟수" text={`${info.stats.broadcastCount} / ${info.next.broadcastCount}회`} value={info.stats.broadcastCount / info.next.broadcastCount} />
            <Progress label="누적 방송 시간" text={`${hoursText(info.stats.totalBroadcastMs)} / ${info.next.hours}시간`} value={info.stats.totalBroadcastMs / (info.next.hours * HOUR_MS)} />
            <Progress label="받은 후원 건수" text={`${info.stats.donationCount} / ${info.next.donationCount}건`} value={info.stats.donationCount / info.next.donationCount} />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-lg bg-surface p-4 md:p-8">
        <h2 className="text-heading-16">등급별 혜택</h2>
        <Tabs
          label="등급별 혜택"
          value={shown}
          onChange={setTab}
          items={GRADES.map((g) => ({ value: g, label: g === info.grade ? `${GRADE_LABEL[g]} · 내 등급` : GRADE_LABEL[g] }))}
        />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1 rounded-md bg-raised p-4">
            <p className="text-caption-12 text-subtle">후원 배분</p>
            <p className="text-heading-20">{b.share}%</p>
          </div>
          <div className="flex flex-col gap-1 rounded-md bg-raised p-4">
            <p className="text-caption-12 text-subtle">다시보기 보관</p>
            <p className="text-heading-20">{b.retention}</p>
          </div>
          <div className="flex flex-col gap-1 rounded-md bg-raised p-4">
            <p className="text-caption-12 text-subtle">닉네임 옆 등급 표시</p>
            <p className="text-heading-20">{b.badge ?? "없음"}</p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-surface p-4 md:p-8">
        <h2 className="text-heading-16">등급 변경 내역</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] text-left">
            <thead className="text-caption-12 text-subtle">
              <tr className="border-b border-line">
                <th className="py-2 pr-4 font-medium">변경일</th>
                <th className="py-2 pr-4 font-medium">등급</th>
                <th className="py-2 font-medium">후원 배분</th>
              </tr>
            </thead>
            <tbody>
              {info.history.map((h, i) => (
                <tr key={i} className="border-b border-line text-body-16">
                  <td className="py-2 pr-4 text-muted">{formatTime(h.changedAt)}</td>
                  <td className="py-2 pr-4"><GradeBadge grade={h.grade} /></td>
                  <td className="py-2 text-number-16">{Math.round(h.shareRate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function GradeBadge({ grade }: { grade: Grade }) {
  return <span className="inline-flex rounded-full bg-raised px-2 py-0.5 text-badge-12 text-muted">{GRADE_LABEL[grade]}</span>;
}

function Progress({ label, text, value }: { label: string; text: string; value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-heading-16">{label}</span>
        <span className="text-number-12 text-subtle">{text}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={cx("h-full rounded-full", pct >= 100 ? "bg-success" : "bg-accent")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
