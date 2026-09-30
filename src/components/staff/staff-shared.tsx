import { buildPaginationSteps, downloadTextFile } from "@/components/menu/menu-shared";
import { normalizeStaffTab, type StaffTabId } from "@/lib/staff-management";

export { buildPaginationSteps, downloadTextFile };

export function readInitialStaffTab(): StaffTabId {
  if (typeof window === "undefined") return "overview";
  const params = new URLSearchParams(window.location.search);
  return normalizeStaffTab(params.get("tab"));
}

export function staffInitials(name: string, fallback = "??") {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase() || fallback;
}
