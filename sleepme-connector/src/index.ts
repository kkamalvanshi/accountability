import { SleepMeMCP } from "./mcp-server";
import { tickCurve } from "./curve-schedule";
import type { SleepMeEnv } from "./sleepme-client";

export { SleepMeMCP };

export default {
  async fetch(request: Request, env: SleepMeEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") {
      // See the equivalent comment in whoop-connector/src/index.ts — McpAgent.serve()'s
      // fetch() env typing doesn't line up with a concrete SleepMeEnv (a Workers/agents-SDK
      // typing gap, not a runtime concern). The actual binding read at runtime is MCP_OBJECT
      // (see wrangler.toml).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return SleepMeMCP.serve("/mcp").fetch(request, env as any, ctx);
    }
    if (url.pathname === "/") {
      return new Response(
        "Sleep.me connector.\n\nAdd this Worker's /mcp URL as a custom connector in Claude.\n",
        { headers: { "Content-Type": "text/plain" } }
      );
    }
    return new Response("Not found", { status: 404 });
  },

  async scheduled(
    _controller: ScheduledController,
    env: SleepMeEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(tickCurve(env));
  },
};
