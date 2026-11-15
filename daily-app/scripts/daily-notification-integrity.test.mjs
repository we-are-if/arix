import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

test("daily service worker sw.js handles push and notification click", () => {
  const swPath = path.join(repoRoot, "daily-app/public/sw.js");
  assert.ok(fs.existsSync(swPath), "daily-app/public/sw.js must exist");
  const content = fs.readFileSync(swPath, "utf8");
  assert.match(content, /addEventListener\("push"/, "Must listen for push event");
  assert.match(content, /showNotification/, "Must show notification via ServiceWorkerRegistration");
  assert.match(content, /addEventListener\("notificationclick"/, "Must handle notification click");
  assert.match(content, /clients\.openWindow/, "Must open window on click");
});

test("main.tsx registers /sw.js with controllerchange handling", () => {
  const mainPath = path.join(repoRoot, "daily-app/src/main.tsx");
  const content = fs.readFileSync(mainPath, "utf8");
  assert.match(content, /navigator\.serviceWorker\.register\("\/sw\.js"/, "Must register /sw.js");
  assert.match(content, /controllerchange/, "Must reload on controllerchange update");
});

test("DailyWorkspace integrates push controls, desktop toast and background notifications", () => {
  const workspacePath = path.join(repoRoot, "daily-app/src/DailyWorkspace.tsx");
  const content = fs.readFileSync(workspacePath, "utf8");
  assert.match(content, /enablePushNotifications/, "Must provide enablePushNotifications");
  assert.match(content, /testPushNotification/, "Must provide testPushNotification");
  assert.match(content, /desktop-notification-toast/, "Must render desktop notification toast");
  assert.match(content, /push-config/, "Must query push-config endpoint");
  assert.match(content, /push-subscriptions/, "Must register push-subscriptions endpoint");
});

test("server/index.js defines daily push endpoints and push notification dispatch", () => {
  const serverPath = path.join(repoRoot, "server/index.js");
  const content = fs.readFileSync(serverPath, "utf8");
  assert.match(content, /resource === "push-config"/, "Must handle /api/daily/push-config");
  assert.match(content, /resource === "push-subscriptions"/, "Must handle /api/daily/push-subscriptions");
  assert.match(content, /resource === "push-test"/, "Must handle /api/daily/push-test");
  assert.match(content, /sendDailyPushNotification/, "Must define sendDailyPushNotification");
});

test("notification popover and management layout enforce dark mode surfaces on mobile and desktop", () => {
  const cssPath = path.join(repoRoot, "daily-app/src/panel-shell.css");
  const css = fs.readFileSync(cssPath, "utf8");
  const workspacePath = path.join(repoRoot, "daily-app/src/DailyWorkspace.tsx");
  const workspace = fs.readFileSync(workspacePath, "utf8");

  assert.match(workspace, /className=\{cx\("top-popover notification-popover",\s*theme === "dark" && "is-dark"\)\}/, "Must pass is-dark to notification popover in dark mode");
  assert.match(css, /:root\[data-theme="dark"\][\s\S]*?color-scheme:\s*dark;/, "panel-shell.css must declare color-scheme: dark");
  assert.match(css, /\.notification-popover\.is-dark[\s\S]*?background:\s*#1e293b\s*!important;/, "Must force dark background on notification popover");
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.notification-popover\.is-dark[\s\S]*?background:\s*#1e293b\s*!important;/, "Mobile media query must guarantee dark background on phone viewports");
});
