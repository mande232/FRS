import { createFileRoute } from "@tanstack/react-router";
import { SettingsShell } from "@/components/settings/settings-shell";
import { useStore } from "@/lib/store";
import { useStockManagementModule } from "@/lib/stock-management";

export const Route = createFileRoute("/app/settings")({ component: SettingsRoute });

function SettingsRoute() {
  const store = useStore();
  const stock = useStockManagementModule();

  return (
    <SettingsShell
      store={store}
      stock={{ settings: stock.settings }}
    />
  );
}
