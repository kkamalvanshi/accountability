import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDeviceStatus, listDevices, resolveDeviceId, setDeviceTemp } from "./sleepme-client";
import type { SleepMeEnv } from "./sleepme-client";
import { scheduleCurve, cancelCurve } from "./curve-schedule";

export class SleepMeMCP extends McpAgent<SleepMeEnv> {
  server = new McpServer({ name: "sleepme-connector", version: "1.0.0" });

  async init() {
    this.server.tool(
      "list_bed_devices",
      "List every Sleep.me (Chilipad/Ooler) device on this account, with each device_id.",
      {},
      async () => ({
        content: [{ type: "text", text: JSON.stringify(await listDevices(this.env), null, 2) }],
      })
    );

    this.server.tool(
      "get_bed_status",
      "Current status of a Sleep.me device — temperature, target, connection state. Omit " +
        "device_id if there's only one device on the account; pass it explicitly if there " +
        "are several (call list_bed_devices first to see the options).",
      { device_id: z.string().optional() },
      async ({ device_id }) => {
        const id = await resolveDeviceId(this.env, device_id);
        const status = await getDeviceStatus(this.env, id);
        return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
      }
    );

    this.server.tool(
      "set_bed_temp",
      "Set a Sleep.me device's target temperature (Fahrenheit) and thermal control status " +
        "right now. Use this for one-off adjustments; for a full night's curve use " +
        "schedule_temp_curve instead.",
      {
        temp_f: z.number().min(55).max(115).describe("Target temperature in Fahrenheit"),
        thermal_control_status: z
          .enum(["active", "standby"])
          .default("active")
          .describe("'active' runs the target now; 'standby' pauses the device"),
        device_id: z.string().optional(),
      },
      async ({ temp_f, thermal_control_status, device_id }) => {
        const id = await resolveDeviceId(this.env, device_id);
        const result = await setDeviceTemp(this.env, id, {
          set_temperature_f: temp_f,
          thermal_control_status,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    this.server.tool(
      "schedule_temp_curve",
      "Schedule tonight's full bed-temperature curve — settle at 75°F, cool to a 70°F trough, " +
        "climb proportionally back to 77°F through the night, then ramp to a 115°F wake peak " +
        "over the last 20 minutes before wake time. Call this ONCE with the computed bedtime " +
        "and wake time (e.g. from WHOOP's sleep-need numbers plus the calendar's wake time); " +
        "the connector pushes each setpoint to the device on its own over the course of the " +
        "night (checked every 5 minutes) — no need to call set_bed_temp yourself after this.",
      {
        bedtime_iso: z.string().describe("ISO 8601 timestamp for tonight's bedtime"),
        wake_iso: z.string().describe("ISO 8601 timestamp for tomorrow's wake time"),
        device_id: z.string().optional(),
      },
      async ({ bedtime_iso, wake_iso, device_id }) => {
        const result = await scheduleCurve(this.env, bedtime_iso, wake_iso, device_id);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    this.server.tool(
      "cancel_temp_curve",
      "Cancel tonight's scheduled bed-temperature curve, if one is currently pending.",
      {},
      async () => {
        await cancelCurve(this.env);
        return { content: [{ type: "text", text: "Cancelled." }] };
      }
    );
  }
}
