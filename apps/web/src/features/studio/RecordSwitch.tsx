"use client";
import { Toggle } from "./Toggle";

const HELP = "켜면 방송이 끝난 뒤 다시보기가 만들어져요. 한 번에 3분까지 녹화되고, 처음에는 나만 볼 수 있어요";

/** "이 방송 녹화하기" 스위치와 "?" 도움말(4-4의 5번). 방송을 시작하면 바꿀 수 없다. */
export function RecordSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <Toggle checked={checked} onChange={onChange} label="이 방송 녹화하기" disabled={disabled} />
      <span className="text-sm font-medium">이 방송 녹화하기</span>
      <span className="group relative">
        <button type="button" aria-label="녹화 도움말" aria-describedby="record-help" className="grid size-5 place-items-center rounded-full bg-surface-2 text-xs text-muted">
          ?
        </button>
        <span
          id="record-help"
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-64 -translate-x-1/2 rounded-lg bg-black px-3 py-2 text-xs leading-relaxed text-white shadow-lg group-focus-within:block group-hover:block"
        >
          {HELP}
        </span>
      </span>
    </div>
  );
}
