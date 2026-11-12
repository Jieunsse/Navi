"use client";
import { api, TITLE_MAX, type SourceType } from "@nabi/shared";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useRequireLogin } from "@/entities/session/session";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { Button, cx, Field, Input } from "@/shared/ui";

// 휴대폰 브라우저에는 화면 공유가 없다(4-3).
const noop = () => () => {};
const canShareScreen = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

export default function NewBroadcastPage() {
  const { me } = useRequireLogin();
  const router = useRouter();
  const screenOk = useSyncExternalStore(noop, canShareScreen, () => false);
  const [titleInput, setTitle] = useState<string | null>(null);
  const [sourceChoice, setSource] = useState<SourceType | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!me) return null;
  const title = titleInput ?? `${me.nickname}의 방송`;
  const source = sourceChoice ?? (screenOk ? "screen" : "camera");
  const tooLong = title.length > TITLE_MAX;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">방송 만들기</h1>
      <form
        className="flex flex-col gap-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const { id } = await apiFetch(api.createBroadcast, { title: title.trim(), sourceType: source });
            router.push(`/studio/${id}`);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "잠시 뒤에 다시 시도해 주세요");
            setBusy(false);
          }
        }}
      >
        <Field label="제목" error={error || (tooLong ? `제목은 ${TITLE_MAX}자까지예요` : undefined)}>
          <div className="relative">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} invalid={tooLong || !!error} className="pr-16" />
            <span className={cx("absolute inset-y-0 right-3 grid place-items-center text-xs", tooLong ? "text-danger" : "text-muted")}>
              {title.length}/{TITLE_MAX}
            </span>
          </div>
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">송출 방식</span>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["screen", "🖥️", "PC 화면 공유", screenOk ? "탭이나 창을 그대로 보여줘요" : "휴대폰에서는 고를 수 없어요"],
                ["camera", "📷", "카메라", "카메라와 마이크로 방송해요"],
              ] as const
            ).map(([key, icon, label, desc]) => (
              <button
                key={key}
                type="button"
                disabled={key === "screen" && !screenOk}
                onClick={() => setSource(key)}
                aria-pressed={source === key}
                className={cx("flex flex-col items-start gap-1 rounded-xl border p-4 text-left disabled:opacity-40", source === key ? "border-accent bg-accent/10" : "border-line bg-surface")}
              >
                <span className="text-2xl">{icon}</span>
                <span className="font-semibold">{label}</span>
                <span className="text-xs text-muted">{desc}</span>
              </button>
            ))}
          </div>
        </div>
        <Button type="submit" loading={busy} disabled={!title.trim() || tooLong}>
          만들기
        </Button>
      </form>
    </div>
  );
}
