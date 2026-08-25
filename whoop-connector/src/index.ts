import { WhoopMCP } from "./mcp-server";
import { handleAuthorize, handleCallback, type WhoopEnv } from "./oauth";

export { WhoopMCP };

export default {
  async fetch(request: Request, env: WhoopEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/authorize") {
      return handleAuthorize(request, env);
    }
    if (url.pathname === "/callback") {
      return handleCallback(request, env);
    }
    if (url.pathname === "/mcp") {
      // McpAgent.serve()'s fetch() wants a Record<string, DurableObjectNamespace<McpAgent<...>>>
      // env shape, and its generic variance doesn't line up with a concrete WhoopEnv (which has
      // its own named bindings, not an index signature) — this is a Workers/agents-SDK typing gap,
      // not a runtime concern: the actual binding read at runtime is MCP_OBJECT (see wrangler.toml).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return WhoopMCP.serve("/mcp").fetch(request, env as any, ctx);
    }
    if (url.pathname === "/") {
      return new Response(
        "WHOOP connector.\n\n" +
          "1. Visit /authorize once to connect your WHOOP account.\n" +
          "2. Add this Worker's /mcp URL as a custom connector in Claude.\n",
        { headers: { "Content-Type": "text/plain" } }
      );
    }
    return new Response("Not found", { status: 404 });
  },
};
