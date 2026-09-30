import { Eye, EyeOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatETB } from "@/lib/ethiopic";

const STORAGE_KEY = "ethioplate.dashboard.hideMoney";
const SYNC_EVENT = "ethioplate-hide-money";

export const HIDDEN_MONEY_MASK = "*****";

function readHideMoneyPreference() {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return true;
    return stored === "1";
  } catch {
    return true;
  }
}

function writeHideMoneyPreference(hidden: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
  } catch {
    // ignore quota / private-mode failures
  }
}

export function formatDashboardMoney(value: number, hidden: boolean) {
  return hidden ? HIDDEN_MONEY_MASK : formatETB(value);
}

export function useHideMoney() {
  const [hidden, setHidden] = useState(readHideMoneyPreference);

  useEffect(() => {
    const sync = () => {
      const next = readHideMoneyPreference();
      setHidden((current) => (current === next ? current : next));
    };
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SYNC_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback(() => {
    setHidden((value) => {
      const next = !value;
      writeHideMoneyPreference(next);
      queueMicrotask(() => window.dispatchEvent(new Event(SYNC_EVENT)));
      return next;
    });
  }, []);

  return { hidden, toggle };
}

export function MoneyVisibilityToggle({
  hidden,
  onToggle,
  t,
  className = "",
}: {
  hidden: boolean;
  onToggle: () => void;
  t: (en: string, am: string) => string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      className={`inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-surface-2 sm:w-auto ${className}`}
      aria-pressed={!hidden}
      aria-label={hidden ? t("Show amounts", "መጠኖችን አሳይ") : t("Hide amounts", "መጠኖችን ደብቅ")}
    >
      {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      {hidden ? t("Show", "አሳይ") : t("Hide", "ደብቅ")}
    </button>
  );
}
