// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

type CapturedError = {
  error: unknown;
  at: number;
  source: string;
};

let lastCapturedError: CapturedError | undefined;
const TTL_MS = 5_000;

function isFreshCapture(entry: CapturedError | undefined) {
  return Boolean(entry && Date.now() - entry.at <= TTL_MS);
}

function record(error: unknown, source: string) {
  if (isFreshCapture(lastCapturedError)) {
    return;
  }
  lastCapturedError = { error, at: Date.now(), source };
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) =>
    record((event as ErrorEvent).error ?? event, "globalThis.error"),
  );
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason, "globalThis.unhandledrejection"),
  );
}

const processLike =
  typeof globalThis === "object" && "process" in globalThis
    ? (globalThis.process as {
        on?: (event: string, listener: (...args: unknown[]) => void) => void;
      })
    : undefined;

processLike?.on?.("uncaughtException", (error) => {
  record(error, "process.uncaughtException");
});

processLike?.on?.("unhandledRejection", (reason) => {
  record(reason, "process.unhandledRejection");
});

export function captureError(error: unknown, source = "manual") {
  record(error, source);
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (!isFreshCapture(lastCapturedError)) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error, source } = lastCapturedError;
  lastCapturedError = undefined;

  if (error instanceof Error && !error.message.includes(`[captured via ${source}]`)) {
    error.message = `${error.message} [captured via ${source}]`;
  }

  return error;
}
