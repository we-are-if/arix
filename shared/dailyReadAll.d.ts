import type { MouseEvent } from "react";
export function markAllDailyNotifications<T>(event: MouseEvent<HTMLButtonElement>, setNotifications: (value: T[]) => void, companyId: string): Promise<void>;
