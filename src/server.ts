import "./lib/error-capture";

import { captureError } from "./lib/error-capture";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }
// test
  const swallowed = consumeLastCapturedError();
  const diagnostic = swallowed ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(diagnostic);
  return new Response(renderErrorPage(describeError(diagnostic)), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
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

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);

      if (response.status >= 500) {
        const cloned = response.clone();
        const contentType = cloned.headers.get("content-type") ?? "";
        const body = await cloned.text().catch(() => "");
        captureError(
          new Error(
            [
              `SSR request failed for ${request.method} ${new URL(request.url).pathname}`,
              `status=${response.status}`,
              `content-type=${contentType || "unknown"}`,
              body ? `body=${body}` : "body=<empty>",
            ].join("\n"),
          ),
          "server.fetch.response",
        );
      }

      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      captureError(error, "server.fetch.catch");
      if (error instanceof Response) {
        return error;
      }
      console.error(error);
      return new Response(renderErrorPage(describeError(error)), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
