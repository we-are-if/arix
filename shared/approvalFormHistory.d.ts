export function sortApprovalHistory<T extends { id: string; status: string; createdAt: string; isCurrent?: boolean; sourceOrderId?: string }>(entries: T[]): T[];
