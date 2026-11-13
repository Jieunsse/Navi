// pnpm grant-admin <이메일> → 그 계정에 운영자 표시를 붙인다(07 4-15). 표시는 이 스크립트로만 붙인다.
// pnpm grant-admin <이메일> --revoke → 운영자 표시를 뗀다.
// pnpm grant-admin <이메일> --target=production → 배포 환경. 프로젝트 이름을 한 번 더 입력해야 실행된다.
import { createInterface } from "node:readline/promises";
import { adminAuth, db } from "../src/adapters/firebase.ts";

const email = process.argv.slice(2).find((a) => !a.startsWith("--"));
const revoke = process.argv.includes("--revoke");
const target = process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "emulator";
if (!email) throw new Error("사용법: pnpm grant-admin <이메일> [--revoke] [--target=production]");
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

const { uid } = await adminAuth().getUserByEmail(email);
const ref = db().collection("users").doc(uid);
// 가입을 마치지 않아 사용자 문서가 없으면 운영자 표시만 있는 문서가 생기므로 멈춘다.
if (!(await ref.get()).exists) throw new Error("가입을 마치지 않은 계정이에요. 먼저 가입을 끝내 주세요");
await ref.update({ isAdmin: !revoke });
console.log(`${email}(${uid}): 운영자 표시를 ${revoke ? "뗐어요" : "붙였어요"}`);
