import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

function isFrameworkHttpError(error: unknown) {
  if (error instanceof Response) return true;
  if (error == null || typeof error !== "object") return false;

  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    message?: unknown;
    name?: unknown;
  };

  return (
    typeof candidate.status === "number" ||
    typeof candidate.statusCode === "number" ||
    candidate.message === "HTTPError" ||
    candidate.name === "HTTPError"
  );
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return [error.name, error.message, error.stack].filter(Boolean).join("\n");
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (isFrameworkHttpError(error)) {
      if (error instanceof Response) {
        return error;
      }
      throw error;
    }

    console.error(error);
    return new Response(renderErrorPage(describeError(error)), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
