import { createContext } from "react";

/**
 * Isolated from store.tsx so Vite HMR / mixed import paths
 * (`@/lib/store` vs `@/lib/store.tsx`) cannot create a second React context.
 * Typed at the useStore() boundary in store.tsx.
 */
export const StoreCtx = createContext<null | object>(null);
