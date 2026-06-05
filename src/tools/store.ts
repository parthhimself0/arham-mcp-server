import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchAncillaryPage, getApiToken } from "../api-client.js";

const PAGE_KEYS = ["TERMS", "ABOUT", "CONTACT", "PRIVACY", "REFUND", "CITY_POLICY"] as const;
const PAGE_LABELS: Record<string, string> = {
  TERMS: "Terms & Conditions",
  ABOUT: "About Us",
  CONTACT: "Contact Information",
  PRIVACY: "Privacy Policy",
  REFUND: "Refund Policy",
  CITY_POLICY: "City Policy",
};

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function registerStoreTools(server: McpServer) {
  server.tool(
    "get_store_info",
    "Get store information like contact details, about us, terms, refund policy, etc.",
    {
      page: z
        .enum(["ABOUT", "CONTACT", "TERMS", "PRIVACY", "REFUND", "CITY_POLICY"])
        .optional()
        .describe("Which page to fetch. If omitted, returns all available pages."),
    },
    async ({ page }) => {
      try {
        const token = getApiToken();
        const pagesToFetch = page ? [page] : [...PAGE_KEYS];
        const results: string[] = [];

        for (const key of pagesToFetch) {
          const data = await fetchAncillaryPage(token, key);
          if (data) {
            const title = PAGE_LABELS[key] ?? key;
            const content = data.content ? stripHtml(data.content) : "No content available";
            results.push(`=== ${title} ===\n${content}`);
          }
        }

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Store information is currently unavailable. Please contact the store directly.",
              },
            ],
          };
        }

        return {
          content: [{ type: "text" as const, text: results.join("\n\n") }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching store info: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
