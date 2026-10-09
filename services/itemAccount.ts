import type { AuthSession } from "../types/auth";

let session: AuthSession | null = null;
let generation = 0;
export function selectItemAccount(next: AuthSession | null) {
  if (session?.user.id !== next?.user.id || session?.token !== next?.token) generation++;
  session = next;
}
export function getItemAccount() { return session?.user.id ?? null; }
export function getItemSyncSession() { return session; }
export function itemSessionGeneration() { return generation; }
export function accountAlarmId(id: string, account = getItemAccount()): string {
  return account ? `notiva-account[${encodeURIComponent(account)}]::${id}` : id;
}
export function localAlarmItemId(id: string): string | undefined {
  const marker = id.match(/notiva-account\[([^\]]+)\]::/);
  if (!marker) return id;
  if (marker[1] !== encodeURIComponent(getItemAccount() ?? "")) return undefined;
  return id.replace(marker[0], "");
}
export function ownsAlarmItemId(id: string): boolean {
  return !getItemAccount() || (id.includes("notiva-account[") && localAlarmItemId(id) !== undefined);
}
