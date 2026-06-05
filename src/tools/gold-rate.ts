import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchCurrentGoldRate, fetchGoldRateHistory, getApiToken } from "../api-client.js";

export function registerGoldRateTools(server: McpServer) {
  server.tool(
    "get_current_gold_rate",
    "Get the current gold rate per gram. Returns the latest rate set by the store.",
    {},
    async () => {
      try {
        const token = getApiToken();
        const rate = await fetchCurrentGoldRate(token);

        if (!rate) {
          return {
            content: [
              { type: "text" as const, text: "Unable to fetch current gold rate." },
            ],
          };
        }

        const details = [
          `Current Gold Rate`,
          `Rate per Gram: ₹${rate.ratePerGram}`,
          `Set By: ${rate.setBy ?? "N/A"}`,
          `Last Updated: ${new Date(rate.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: details }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching gold rate: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get_gold_rate_history",
    "Get historical gold rates. Returns a list of past rate entries.",
    {
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Page number for pagination (default 1)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Number of entries per page (default 10)"),
    },
    async ({ page, limit }) => {
      try {
        const token = getApiToken();
        const history = await fetchGoldRateHistory(
          token,
          page ?? 1,
          limit ?? 10
        );

        if (history.length === 0) {
          return {
            content: [
              { type: "text" as const, text: "No gold rate history available." },
            ],
          };
        }

        const entries = history.map((r) => {
          return [
            `Rate: ₹${r.ratePerGram}/gram`,
            `Set By: ${r.setBy ?? "N/A"}`,
            `Date: ${new Date(r.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
          ].join(" | ");
        });

        const summary = [
          `Gold Rate History (Page ${page ?? 1}):`,
          "",
          ...entries,
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: summary }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching gold rate history: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
