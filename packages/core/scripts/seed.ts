// pnpm seed → 심사용 테스트 계정 9개와 더미 데이터를 처음부터 다시 만든다(07 4-18).
// pnpm seed --reset → 같은 함수를 부른다. 운영자 화면의 "전체 초기화"와 같다. 여러 번 돌려도 결과가 같다.
// pnpm seed --target=production → 배포 환경. 프로젝트 이름을 한 번 더 입력해야 실행된다.
import { createInterface } from "node:readline/promises";
import { broadcasts } from "../src/container.ts";
import { seedUseCases } from "../src/application/seed.ts";

const target = process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "emulator";
if (target === "emulator" && !process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
}
if (target === "production") {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await rl.question(`실행하려면 Firebase 프로젝트 이름(${process.env.FIREBASE_PROJECT_ID})을 입력하세요: `);
  rl.close();
  if (typed !== process.env.FIREBASE_PROJECT_ID) throw new Error("프로젝트 이름이 맞지 않아 멈췄어요");
}

const started = Date.now();
await seedUseCases({ end: broadcasts().end, log: (m) => console.log(m) }).rebuild();
console.log(`끝: 계정 9개와 더미 데이터를 만들었어요 (${Math.round((Date.now() - started) / 1000)}초)`);
