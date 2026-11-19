// 문서 사이의 상대 링크와 #제목 링크가 실제로 있는지 확인한다. 깨진 링크가 있으면 exit 1.
// 사용: node scripts/check-doc-links.mjs [--self-test]
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// GitHub과 같은 방식으로 제목에서 링크 주소를 만든다.
export function slug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

function stripFences(md) {
  return md.replace(/^(```|~~~)[\s\S]*?^\1/gm, "");
}

export function anchorsOf(md) {
  const seen = new Map();
  const out = new Set();
  for (const m of stripFences(md).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = slug(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
}

function check(files) {
  const cache = new Map();
  const read = (f) => {
    if (!cache.has(f)) cache.set(f, readFileSync(f, "utf8"));
    return cache.get(f);
  };
  const broken = [];
  for (const file of files) {
    const lines = stripFences(read(file)).split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/\]\((?:<([^>]+)>|([^)\s]+))\)/g)) {
        const href = m[1] ?? m[2];
        if (/^[a-z]+:/i.test(href)) continue; // http, mailto 등 바깥 링크
        const [path, hash] = href.split("#");
        const target = path ? resolve(dirname(file), decodeURI(path)) : file;
        if (!existsSync(target)) {
          broken.push(`${file}:${i + 1} 파일 없음 → ${href}`);
          continue;
        }
        if (hash && target.endsWith(".md") && !anchorsOf(read(target)).has(decodeURIComponent(hash))) {
          broken.push(`${file}:${i + 1} 제목 없음 → ${href}`);
        }
      }
    });
  }
  return broken;
}

if (process.argv.includes("--self-test")) {
  const assert = (await import("node:assert/strict")).default;
  assert.equal(slug("4-2. 홈(방송 목록)"), "4-2-홈방송-목록");
  assert.equal(slug("E. 송출 화면 (PC) — 방송 중과 종료"), "e-송출-화면-pc--방송-중과-종료");
  assert.equal(slug("결정 2. 배포 서비스: Vercel + Firebase + Cloudflare R2"), "결정-2-배포-서비스-vercel--firebase--cloudflare-r2");
  assert.deepEqual([...anchorsOf("# A\n## A\n```\n# 코드\n```\n")], ["a", "a-1"]);
  console.log("self-test ok");
} else {
  const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
  const files = ["README.md", "AGENTS.md", ...readdirSync(join(root, "docs")).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`)]
    .map((f) => join(root, f))
    .filter(existsSync);
  const broken = check(files).map((b) => b.replace(root + "/", ""));
  if (broken.length) {
    console.error(broken.join("\n"));
    console.error(`\n깨진 링크 ${broken.length}개`);
    process.exit(1);
  }
  console.log(`문서 ${files.length}개, 깨진 링크 없음`);
}
