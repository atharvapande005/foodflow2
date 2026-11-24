import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(n?: number | null): string {
  return `₹${Number(n ?? 0).toFixed(0)}`;
}

export function timeAgo(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "PLACED": return "status-placed";
    case "PREPARING": return "status-preparing";
    case "READY": return "status-ready";
    case "COMPLETED": return "status-completed";
    case "CANCELLED": return "status-cancelled";
    case "PAID": return "status-completed";
    case "REFUNDED": return "status-preparing";
    case "PENDING": return "status-placed";
    default: return "";
  }
}
