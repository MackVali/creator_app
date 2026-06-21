import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const FIREBASE_APP_NAME = "creator-push";

function getFirebaseServiceAccount(): ServiceAccount {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!encoded) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is not configured.");
  }

  const json = Buffer.from(encoded, "base64").toString("utf8");
  return JSON.parse(json) as ServiceAccount;
}

export function getCreatorFirebaseMessaging() {
  const existingApp = getApps().find((app) => app.name === FIREBASE_APP_NAME);

  const app =
    existingApp ??
    initializeApp(
      {
        credential: cert(getFirebaseServiceAccount()),
      },
      FIREBASE_APP_NAME,
    );

  return getMessaging(app);
}
