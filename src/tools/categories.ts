import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchCategories, fetchProducts, getApiToken } from "../api-client.js";
import type { Category, Product } from "../types.js";

function formatCategory(c: Category, indent: number = 0): string {
  const prefix = "  ".repeat(indent);
  const lines = [`${prefix}- ${c.name} (ID: ${c.id}, Level: ${c.level ?? "N/A"})`];
  if (c.children && c.children.length > 0) {
    for (const child of c.children) {
      lines.push(formatCategory(child, indent + 1));
    }
  }
  return lines.join("\n");
}

function formatProduct(p: Product): string {
  const raw = p.rawData ?? {};
  const lines = [
    `Name: ${p.name}`,
    `ID: ${p.id}`,
    `Karat: ${p.karat ?? "N/A"}`,
  ];
  if (raw["GrossWt"]) lines.push(`Weight: ${raw["GrossWt"]}g`);
  if (raw["FineWt"]) lines.push(`Fine: ${raw["FineWt"]}g`);
  if (raw["TagSalesAmount"]) lines.push(`Amount: ₹${raw["TagSalesAmount"]}`);
  return lines.join(" | ");
}

export function registerCategoryTools(server: McpServer) {
  server.tool(
    "get_categories",
    "Get the full category tree. Categories have 3 levels: Level 1 = Karat (e.g. 18K, 20K), Level 2 = Collection, Level 3 = Style. IMPORTANT: Only level 3 category IDs can be used to fetch products. Always use level 3 IDs with get_category_products.",
    {
      level: z
        .number()
        .int()
        .min(1)
        .max(3)
        .optional()
        .describe("Filter by level: 1=Karat, 2=Collection, 3=Style"),
    },
    async ({ level }) => {
      try {
        const token = getApiToken();
        const useTree = level === undefined;
        const categories = await fetchCategories(token, useTree);

        if (categories.length === 0) {
          return {
            content: [
              { type: "text" as const, text: "No categories found." },
            ],
          };
        }

        const formatted = categories.map((c) => formatCategory(c)).join("\n\n");
        const summary = `Category Tree (${categories.length} top-level):\n\n${formatted}\n\nNOTE: Only Level 3 IDs work with get_category_products.`;

        return {
          content: [{ type: "text" as const, text: summary }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching categories: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get_category_products",
    "Get products in a category. IMPORTANT: category_id MUST be a Level 3 (Style) ID. Use get_categories with level=3 to find valid IDs. Level 1 and Level 2 IDs will return 0 products.",
    {
      category_id: z.string().describe("A Level 3 (Style) category ID"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Page number (default 1)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max results (default 20)"),
    },
    async ({ category_id, page, limit }) => {
      try {
        const token = getApiToken();
        const result = await fetchProducts(token, {
          categoryId: category_id,
          page: page ?? 1,
          limit: limit ?? 20,
          showAll: true,
        });

        if (result.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No products found for category '${category_id}'. Make sure you are using a Level 3 (Style) category ID. Use get_categories with level=3 to find valid IDs.`,
              },
            ],
          };
        }

        const formatted = result.data.map(formatProduct).join("\n");
        const summary = [
          `Products (Page ${page ?? 1}, ${result.data.length} shown, ${result.meta?.total ?? 0} total):`,
          "",
          formatted,
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: summary }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching category products: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
