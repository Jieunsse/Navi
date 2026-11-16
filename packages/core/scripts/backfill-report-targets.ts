// pnpm backfill-report-targets → 모든 신고를 읽어 reportTargets(신고 대상 요약)를 다시 만든다. 여러 번 돌려도 결과가 같다.
// pnpm backfill-report-targets --target=production → 배포 환경. 프로젝트 이름을 한 번 더 입력해야 실행된다.
import { createInterface } from "node:readline/promises";
import { db } from "../src/adapters/firebase.ts";
import { syncReportTarget } from "../src/application/moderation.ts";

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

const snap = await db().collection("reports").select("targetUserId").get();
const uids = new Set(snap.docs.map((d) => d.data().targetUserId as string));
for (const uid of uids) await syncReportTarget(uid);
console.log(`신고 대상 ${uids.size}명의 요약을 다시 만들었어요`);
