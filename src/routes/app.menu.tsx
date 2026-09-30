import { createFileRoute } from "@tanstack/react-router";
import { MenuShell } from "@/components/menu/menu-shell";
import { useStore } from "@/lib/store";
import { useStockManagementModule } from "@/lib/stock-management";

export const Route = createFileRoute("/app/menu")({ component: MenuRoute });

function MenuRoute() {
  const store = useStore();
  const stock = useStockManagementModule();

  return (
    <MenuShell
      store={store}
      stock={{
        items: stock.items,
        recipes: stock.recipes,
        balances: stock.balances,
        lots: stock.lots,
      }}
    />
  );
}
