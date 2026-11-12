import { CheckIcon, cx } from "@/shared/ui";

const STEPS = ["미리보기", "소리 확인", "방송 시작"];

/** 방송 시작 단계 표시(시안의 Stepper). 끝난 단계는 체크, 지금 단계는 굵게. */
export function Stepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-2" aria-label={`3단계 중 ${current}단계, ${STEPS[current - 1]}`}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const now = n === current;
        return (
          <li key={label} className="flex items-center gap-2" aria-current={now ? "step" : undefined}>
            {i > 0 && <span aria-hidden className={cx("h-px w-6", n <= current ? "bg-text" : "bg-line")} />}
            <span
              aria-hidden
              className={cx(
                "grid size-6 place-items-center rounded-full text-caption-12",
                done && "bg-accent text-accent-ink",
                now && "border-2 border-text text-text",
                n > current && "border border-line text-subtle",
              )}
            >
              {done ? <CheckIcon size={16} /> : n}
            </span>
            <span className={cx(now ? "text-heading-16" : done ? "text-caption-12 text-muted" : "text-caption-12 text-subtle")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
