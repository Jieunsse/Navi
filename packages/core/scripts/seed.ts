// shortcut: 지금은 버튼 계정 3개만 만든다. 후원·신고 기록 시드(4-18)는 그 기능을 만들 때 더한다.
import { TEST_ACCOUNTS } from "@nabi/shared";
import { adminAuth, db } from "../src/adapters/firebase.ts";
import { createUserDocs } from "../src/application/account.ts";

const target = process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "emulator";
if (target === "emulator" && !process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
}
if (target === "production") {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await rl.question(`실행하려면 Firebase 프로젝트 이름(${process.env.FIREBASE_PROJECT_ID})을 입력하세요: `);
  rl.close();
  if (typed !== process.env.FIREBASE_PROJECT_ID) throw new Error("프로젝트 이름이 맞지 않아 멈췄어요");
}

const accounts = [
  { uid: TEST_ACCOUNTS.broadcaster, nickname: "테스트방송자", seedKind: "testBroadcaster" },
  { uid: TEST_ACCOUNTS.viewer, nickname: "테스트시청자", seedKind: "testViewer" },
  { uid: TEST_ACCOUNTS.admin, nickname: "테스트운영자", seedKind: "testAdmin", isAdmin: true, isTestAdmin: true },
];

for (const a of accounts) {
  const email = `${a.uid}@nabi.test`;
  await adminAuth().getUser(a.uid).catch(() => adminAuth().createUser({ uid: a.uid, email, password: crypto.randomUUID() }));
  const exists = (await db().collection("users").doc(a.uid).get()).exists;
  if (!exists) {
    const { uid, nickname, ...extra } = a;
    await createUserDocs(uid, nickname, email, { ...extra, seedData: true });
  }
  console.log(`${exists ? "있음" : "만듦"}: ${a.nickname}`);
}
