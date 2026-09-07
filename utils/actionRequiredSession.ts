import { ReminderItem } from "../types/item";
import { isActionRequired } from "./itemSorting";

// Memory only: survives Home remounts but resets when the app's JS runtime restarts.
let checkedThisLaunch = false;

export function shouldAutoOpenActionRequired(items: ReminderItem[]): boolean {
  if (checkedThisLaunch) return false;
  checkedThisLaunch = true;
  return items.some((item) => isActionRequired(item));
}
