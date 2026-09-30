import type { ReactNode } from "react";
import { StockModuleProvider } from "@/lib/stock-management";
import { useStore } from "@/lib/store";

/** Single shared stock module for the signed-in app (avoids N×28 hydrate/realtime mounts). */
export function StockModuleBridge({ children }: { children: ReactNode }) {
  const { salesRecords } = useStore();
  return <StockModuleProvider salesRecords={salesRecords}>{children}</StockModuleProvider>;
}
