import { categoryHue, type CategoryId } from "@nabi/shared";
import type { ReactNode } from "react";
import { BookOpenIcon, DumbbellIcon, GamepadIcon, MessageCircleIcon, MusicIcon, PaletteIcon, PlaneIcon, UtensilsIcon } from "@/shared/ui";

const icons: Record<CategoryId, (p: { size?: number }) => ReactNode> = {
  잡담: MessageCircleIcon,
  게임: GamepadIcon,
  공부: BookOpenIcon,
  음악: MusicIcon,
  요리: UtensilsIcon,
  그림: PaletteIcon,
  운동: DumbbellIcon,
  여행: PlaneIcon,
};

export function CategoryIcon({ id, size }: { id: CategoryId; size?: number }) {
  const I = icons[id];
  return <I size={size} />;
}

/**
 * 카테고리별 그라데이션 배경.
 * shortcut: 색 토큰에 카테고리 색이 없어(globals.css는 이번에 고치지 않음) 색상 각도만 받아 낮은 채도로 만든다. 토큰이 생기면 바꾼다.
 */
export const hueBg = (hue: number) => ({ backgroundImage: `linear-gradient(135deg, oklch(0.38 0.09 ${hue}), oklch(0.24 0.05 ${(hue + 40) % 360}))` });
export const categoryBg = (id: string) => hueBg(categoryHue(id));
