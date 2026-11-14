import { z } from "zod";

/** 방송 카테고리 고정 목록(07 4-3). 문서에 값이 없으면 "잡담"으로 본다. hue는 화면이 카테고리별 배경색을 만들 때 쓰는 색상 각도(0~360). */
export const CATEGORIES = [
  { id: "잡담", hue: 250 },
  { id: "게임", hue: 300 },
  { id: "공부", hue: 220 },
  { id: "음악", hue: 340 },
  { id: "요리", hue: 60 },
  { id: "그림", hue: 170 },
  { id: "운동", hue: 140 },
  { id: "여행", hue: 200 },
] as const;

export const categorySchema = z.enum(CATEGORIES.map((c) => c.id) as [string, ...string[]]);
export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const DEFAULT_CATEGORY: CategoryId = "잡담";

/** 모르는 값이나 비어 있는 값은 "잡담"으로 돌린다. */
export const asCategory = (v: unknown): CategoryId => (CATEGORIES.some((c) => c.id === v) ? (v as CategoryId) : DEFAULT_CATEGORY);
export const categoryHue = (id: string) => CATEGORIES.find((c) => c.id === id)?.hue ?? 250;
