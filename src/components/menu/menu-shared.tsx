import type { ComponentType } from "react";
import * as Icons from "lucide-react";
import type { ProductionStation } from "@/lib/demo-data";
import { stationIconName } from "@/lib/stations";

export function buildPaginationSteps(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages]);
  if (currentPage <= 4) {
    for (let page = 2; page <= Math.min(5, totalPages - 1); page += 1) pages.add(page);
  } else if (currentPage >= totalPages - 3) {
    for (let page = Math.max(2, totalPages - 4); page <= totalPages - 1; page += 1) pages.add(page);
  } else {
    for (let page = currentPage - 1; page <= currentPage + 1; page += 1) pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.reduce<Array<number | "ellipsis">>((result, page) => {
    const last = result[result.length - 1];
    if (typeof last === "number" && page - last > 1) result.push("ellipsis");
    result.push(page);
    return result;
  }, []);
}

export function StationIcon({ station, className }: { station: ProductionStation; className?: string }) {
  const Cmp =
    (Icons as unknown as Record<string, ComponentType<{ className?: string }>>)[
      stationIconName(station)
    ] ?? Icons.Circle;
  return <Cmp className={className} />;
}

export type MenuTabId = "items" | "categories" | "export";

export const MENU_TABS: Array<{ id: MenuTabId; labelEn: string; labelAm: string }> = [
  { id: "items", labelEn: "Items", labelAm: "እቃዎች" },
  { id: "categories", labelEn: "Categories", labelAm: "ምድቦች" },
  { id: "export", labelEn: "Export", labelAm: "ላክ" },
];

export function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
