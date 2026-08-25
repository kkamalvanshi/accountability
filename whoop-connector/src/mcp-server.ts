import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getLastSleep, getRecovery, getStrain } from "./whoop-client";
import type { WhoopEnv } from "./oauth";

export class WhoopMCP extends McpAgent<WhoopEnv> {
  server = new McpServer({ name: "whoop-connector", version: "1.0.0" });

  async init() {
    this.server.tool(
      "get_last_sleep",
      "Most recent WHOOP sleep record: stages, efficiency, and the computed sleep_need_hours " +
        "(sum of WHOOP's own sleep_needed components) plus onset_buffer_minutes. To get " +
        "tonight's bedtime, take a fixed wake time (from the calendar or a stated habit) and " +
        "compute wake_time - sleep_need_hours - onset_buffer_minutes yourself — this tool " +
        "reports WHOOP's numbers, it does not pick a bedtime.",
      {},
      async () => ({
        content: [{ type: "text", text: JSON.stringify(await getLastSleep(this.env), null, 2) }],
      })
    );

    this.server.tool(
      "get_recovery",
      "Most recent WHOOP recovery record: recovery_score (0-100), resting_heart_rate, HRV " +
        "(hrv_rmssd_milli), SpO2, and skin temperature.",
      {},
      async () => ({
        content: [{ type: "text", text: JSON.stringify(await getRecovery(this.env), null, 2) }],
      })
    );

    this.server.tool(
      "get_strain",
      "Current (or most recent) WHOOP physiological cycle: day strain (0-21), kilojoules, " +
        "average/max heart rate. A missing `end` field means the cycle is still open — this " +
        "is today's strain-so-far, not a finished day.",
      {},
      async () => ({
        content: [{ type: "text", text: JSON.stringify(await getStrain(this.env), null, 2) }],
      })
    );
  }
}
