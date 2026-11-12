// 07 기능 명세의 숫자 규칙. 임시값이라 적힌 것은 여기서만 바꾼다.
export const NICKNAME_RE = /^[가-힣A-Za-z0-9]{2,12}$/;
export const TITLE_MAX = 50;
export const READY_VISIBLE_MS = 60 * 60 * 1000; // 준비 방송을 홈에 보여주는 시간(결정 19)
export const START_TIMEOUT_MS = 30_000; // 송출이 올라오길 기다리는 시간(결정 30)
export const TEST_BROADCAST_LIMIT_MS = 30 * 60 * 1000; // 테스트 방송자 방송 길이(4-18)
export const TEST_BROADCAST_WARN_MS = 25 * 60 * 1000;
export const COUNTED_BROADCAST_MS = 10 * 60 * 1000; // 방송 횟수로 세는 최소 길이(4-12)
export const TERMS_VERSION = "2026-11-07";

export const TEST_ACCOUNTS = {
  broadcaster: "seed-test-broadcaster",
  viewer: "seed-test-viewer",
  admin: "seed-test-admin",
} as const;
export type TestAccountKey = keyof typeof TEST_ACCOUNTS;

// shortcut: 처음 금칙어 목록. 운영자 화면(4-15)의 설정 문서가 생기면 시드 값으로만 쓴다.
export const DEFAULT_BANNED_WORDS = ["시발", "씨발", "ㅅㅂ", "병신", "ㅂㅅ", "개새끼", "좆", "fuck"];

/** 띄어쓰기, 특수문자, 반복 글자를 지운 뒤 비교한다(4-7). */
export function normalizeForBan(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z0-9]/g, "")
    .replace(/(.)\1+/g, "$1");
}

export function findBannedWord(text: string, words: readonly string[] = DEFAULT_BANNED_WORDS): string | null {
  const n = normalizeForBan(text);
  return words.find((w) => n.includes(normalizeForBan(w))) ?? null;
}
