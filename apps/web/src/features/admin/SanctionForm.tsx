"use client";
import { moderationApi, PROTECTED_SEED_KINDS, SANCTION_DAYS, SANCTION_LABEL, TEST_ACCOUNT_PROTECTED_MESSAGE, TEST_ADMIN_SCOPE_MESSAGE, type AdminUser } from "@nabi/shared/moderation.ts";
import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { Button, Input } from "@/shared/ui";
import { useAdmin } from "./AdminGate";

type Kind = keyof typeof SANCTION_LABEL;
const kinds = Object.keys(SANCTION_LABEL) as Kind[];

/** 제재 종류, 기간, 사유를 골라 보낸다. 테스트 운영자가 막히는 이유는 서버와 같은 규칙으로 미리 보여준다(4-15). */
export function useSanctionGuard(user: AdminUser) {
  const { isTestAdmin } = useAdmin();
  if (user.isAdmin) return "운영자에게는 제재를 걸 수 없어요";
  if (!isTestAdmin) return null;
  if (user.masked) return TEST_ADMIN_SCOPE_MESSAGE;
  return user.seedKind && PROTECTED_SEED_KINDS.includes(user.seedKind) ? TEST_ACCOUNT_PROTECTED_MESSAGE : null;
}

export function SanctionForm({ user, onDone, submit }: { user: AdminUser; onDone: () => void; submit?: (v: { kind: Kind; days?: number; reason: string }) => Promise<unknown> }) {
  const [kind, setKind] = useState<Kind>("warning");
  const [days, setDays] = useState<number | undefined>(undefined);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const refusal = useSanctionGuard(user);
  const options: readonly number[] = kind === "chatBan" || kind === "broadcastBan" ? SANCTION_DAYS[kind] : [];
  const needDays = options.length > 0;

  async function run() {
    setBusy(true);
    try {
      const v = { kind, days: needDays ? (days ?? options[0]) : undefined, reason };
      await (submit ? submit(v) : apiFetch(moderationApi.adminSanction, v, { userId: user.uid }));
      toast.success("제재를 걸었어요");
      setReason("");
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface p-4">
      <h3 className="text-heading-16">제재하기</h3>
      <div className="flex flex-wrap gap-2">
        <select value={kind} onChange={(e) => { setKind(e.target.value as Kind); setDays(undefined); }} aria-label="제재 종류" className="h-10 rounded-sm border border-line bg-raised px-3 text-body-16">
          {kinds.map((k) => (
            <option key={k} value={k}>
              {SANCTION_LABEL[k]}
            </option>
          ))}
        </select>
        {needDays && (
          <select value={days ?? options[0]} onChange={(e) => setDays(Number(e.target.value))} aria-label="기간" className="h-10 rounded-sm border border-line bg-raised px-3 text-body-16">
            {options.map((d) => (
              <option key={d} value={d}>
                {d}일
              </option>
            ))}
          </select>
        )}
      </div>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유 (필수)" aria-label="사유" />
      {refusal && <p className="text-caption-12 text-danger">{refusal}</p>}
      <Button variant="danger" loading={busy} disabled={!!refusal || !reason.trim()} onClick={run}>
        제재 걸기
      </Button>
    </div>
  );
}
