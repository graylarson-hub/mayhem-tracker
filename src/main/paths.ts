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
