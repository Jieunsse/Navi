import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// 에뮬레이터는 FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST 환경 변수만 있으면 관리자 SDK가 알아서 붙는다.
function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-nabi";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  return initializeApp(
    clientEmail && privateKey ? { projectId, credential: cert({ projectId, clientEmail, privateKey }) } : { projectId },
  );
}

export const db = () => getFirestore(app());
export const adminAuth = () => getAuth(app());
export const iso = (t: Timestamp | null | undefined) => (t ? t.toDate().toISOString() : null);
export { Timestamp, FieldValue } from "firebase-admin/firestore";
