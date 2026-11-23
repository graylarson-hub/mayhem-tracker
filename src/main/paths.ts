import path from "path";
import fs from "fs";
import { app } from "electron";

// Keep the installed application's existing profile. The source tree and
// portable executable can be replaced without moving the user's history.
export function getRootDir() {
  return app.getPath("userData");
}
function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
export function getDataDir() {
  return ensureDir(path.join(getRootDir(), "data"));
}
export function getBackupDir() {
  return ensureDir(path.join(getRootDir(), "backups"));
}
export function getLogDir() {
  return ensureDir(path.join(getRootDir(), "logs"));
}

// Copies of League art and game data, any of which can be deleted at any time
// and fetched again. Not named "cache": Chromium keeps its HTTP cache in
// userData as "Cache", and on Windows the two names are the same folder.
export function getAssetCacheDir() {
  return ensureDir(path.join(getRootDir(), "asset-cache"));
}
