"use client";
import { api, TITLE_MAX, type SourceType } from "@nabi/shared";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useRequireLogin } from "@/entities/session/session";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { Button, cx, Field, HelpTip, Input, ScreenShareIcon, Switch, VideoIcon } from "@/shared/ui";

// 휴대폰 브라우저에는 화면 공유가 없다(4-3).
const noop = () => () => {};
const canShareScreen = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

export default function NewBroadcastPage() {
  const { me } = useRequireLogin();
  const router = useRouter();
  const screenOk = useSyncExternalStore(noop, canShareScreen, () => false);
  const [titleInput, setTitle] = useState<string | null>(null);
  const [sourceChoice, setSource] = useState<SourceType | null>(null);
  const [withCamera, setWithCamera] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!me) return null;
  const title = titleInput ?? `${me.nickname}의 방송`;
  const source = sourceChoice ?? (screenOk ? "screen" : "camera");
  const tooLong = title.length > TITLE_MAX;

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 py-4 md:py-12">
      <h1 className="text-heading-20 md:text-heading-28">방송 만들기</h1>
      <form
        className="flex flex-col gap-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const { id } = await apiFetch(api.createBroadcast, { title: title.trim(), sourceType: source, withCamera: source === "screen" && withCamera });
            router.push(`/studio/${id}`);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "잠시 뒤에 다시 시도해 주세요");
            setBusy(false);
          }
        }}
      >
        <Field label="방송 제목" error={error || (tooLong ? `제목은 ${TITLE_MAX}자까지예요` : undefined)}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} invalid={tooLong || !!error} />
          <span className={cx("self-end text-caption-12", tooLong ? "text-danger" : "text-subtle")}>
            {title.length}/{TITLE_MAX}
          </span>
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-heading-16">송출 방식</span>
          <div className="flex flex-col gap-3 md:flex-row">
            {(
              [
                ["screen", <ScreenShareIcon key="s" size={24} />, "PC 화면 공유", screenOk ? undefined : "휴대폰에서는 고를 수 없어요"],
                ["camera", <VideoIcon key="v" size={24} />, "카메라", undefined],
              ] as const
            ).map(([key, icon, label, desc]) => {
              const on = source === key;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={key === "screen" && !screenOk}
                  onClick={() => setSource(key)}
                  aria-pressed={on}
                  className={cx("flex min-w-0 flex-1 items-center gap-4 rounded-md p-4 text-left disabled:cursor-not-allowed disabled:opacity-40", on ? "border-2 border-accent bg-raised" : "border border-line bg-surface hover:border-strong")}
                >
                  <span className={cx("grid size-12 shrink-0 place-items-center rounded-sm", on ? "bg-surface" : "bg-raised")}>{icon}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-heading-16">{label}</span>
                    {desc && <span className="text-caption-12 text-muted">{desc}</span>}
                  </span>
                  <span aria-hidden className={cx("grid size-5 shrink-0 place-items-center rounded-full border-2", on ? "border-accent" : "border-strong")}>
                    {on && <span className="size-2 rounded-full bg-accent" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {source === "screen" && screenOk && (
          <div className="flex items-center gap-1">
            <div className="flex w-80 max-w-full items-center justify-between gap-3">
              <span className="text-body-16">내 얼굴도 같이 보여주기</span>
              <Switch checked={withCamera} onChange={setWithCamera} label="내 얼굴도 같이 보여주기" />
            </div>
            <HelpTip text="화면 오른쪽 아래에 작은 카메라 창이 나와요" />
          </div>
        )}
        <Button type="submit" size="lg" loading={busy} disabled={!title.trim() || tooLong}>
          만들기
        </Button>
      </form>
    </div>
  );
}
