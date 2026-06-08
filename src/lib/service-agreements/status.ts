export type ServiceAgreementStatus = "active" | "expired" | "cancelled";

export const SA_STATUS_LABEL: Record<ServiceAgreementStatus, string> = {
  active: "Active",
  expired: "Expired",
  cancelled: "Cancelled",
};

export const SA_STATUS_VARIANT: Record<
  ServiceAgreementStatus,
  "default" | "secondary" | "warning" | "success" | "destructive" | "outline"
> = {
  active: "success",
  expired: "secondary",
  cancelled: "destructive",
};

export function saStatusLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return SA_STATUS_LABEL[s as ServiceAgreementStatus] ?? s;
}

/** Days until an agreement's end_date; null if no end date. */
export function daysUntil(endDate: string | null, today: string): number | null {
  if (!endDate) return null;
  const ms = Date.parse(endDate) - Date.parse(today);
  return Math.round(ms / 86_400_000);
}

/** Active agreement whose end_date falls within `windowDays` (default 90). */
export function isExpiringSoon(
  status: string,
  endDate: string | null,
  today: string,
  windowDays = 90,
): boolean {
  if (status !== "active" || !endDate) return false;
  const d = daysUntil(endDate, today);
  return d != null && d >= 0 && d <= windowDays;
}
