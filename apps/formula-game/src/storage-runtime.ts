import {
  getOperationalEnvironment,
  Storage,
} from "@apps-in-toss/web-framework";
import { configureLearningStorage, migrateBrowserLearning } from "./storage.ts";

export const inToss = (() => {
  try {
    const environment = getOperationalEnvironment();
    return environment === "toss" || environment === "sandbox";
  } catch {
    // If the native bridge is unavailable in Toss, fail visibly on load.
    // Do not silently switch that learner to browser storage.
    return /TossApp\//.test(navigator.userAgent);
  }
})();

if (inToss) configureLearningStorage(Storage);

export async function prepareLearningStorage() {
  if (inToss) await migrateBrowserLearning(Storage, localStorage);
}
