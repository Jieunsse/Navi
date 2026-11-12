"use client";
import { adminOpsApi, BANNED_WORD_MAX, type bannedWordsSchema } from "@nabi/shared/adminOps.ts";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { toast } from "sonner";
import { AdminGate } from "@/features/admin/AdminGate";
import { Card, fail, PageHead } from "@/features/admin/adminUi";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button, Input, Notice } from "@/shared/ui";

type View = z.output<typeof bannedWordsSchema>;

function Body() {
  const [view, setView] = useState<View | null>(null);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void apiFetch(adminOpsApi.bannedWords).then(setView, fail);
  }, []);

  async function change(add: boolean, w: string) {
    setBusy(true);
    try {
      setView(await apiFetch(add ? adminOpsApi.addBannedWord : adminOpsApi.removeBannedWord, { word: w }));
      if (add) setWord("");
      toast.success(add ? "금칙어를 더했어요" : "금칙어를 뺐어요");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHead title="금칙어 관리" desc="바꾸면 1분 안에 채팅, 방송 제목, 닉네임, 미션 검사에 쓰여요." />
      {view?.readOnly && <Notice>테스트 운영자는 금칙어를 볼 수만 있어요.</Notice>}
      {view && !view.readOnly && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void change(true, word);
          }}
        >
          <Input value={word} maxLength={BANNED_WORD_MAX} placeholder="더할 금칙어" onChange={(e) => setWord(e.target.value)} />
          <Button type="submit" className="shrink-0" loading={busy} disabled={!word.trim()}>더하기</Button>
        </form>
      )}
      <Card>
        <ul className="flex flex-wrap gap-2">
          {view?.words.map((w) => (
            <li key={w} className="inline-flex items-center gap-2 rounded-sm bg-raised px-3 py-2 text-body-16">
              {w}
              {!view.readOnly && (
                <button type="button" aria-label={`${w} 빼기`} disabled={busy} className="text-caption-12 text-muted hover:text-text" onClick={() => void change(false, w)}>
                  빼기
                </button>
              )}
            </li>
          ))}
        </ul>
        {view?.words.length === 0 && <p className="text-body-16 text-muted">금칙어가 없어요</p>}
        {view?.updatedAt && <p className="text-caption-12 text-subtle">마지막으로 바꾼 때 {formatTime(view.updatedAt)}</p>}
      </Card>
    </div>
  );
}

export default function AdminBannedWordsPage() {
  return (
    <AdminGate>
      <Body />
    </AdminGate>
  );
}
