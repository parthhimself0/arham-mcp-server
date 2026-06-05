import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchProducts, searchProducts, getApiToken } from "../api-client.js";
import type { Product } from "../types.js";

function formatProduct(p: Product): string {
  const raw = p.rawData ?? {};
  const lines = [
    `Name: ${p.name}`,
    `ID: ${p.id}`,
    `Karat: ${p.karat ?? "N/A"}`,
    `Active: ${p.isActive ? "Yes" : "No"}`,
  ];

  if (p.tagNo) lines.push(`Tag No: ${p.tagNo}`);
  if (raw["GrossWt"]) lines.push(`Gross Weight: ${raw["GrossWt"]}g`);
  if (raw["FineWt"]) lines.push(`Fine Weight: ${raw["FineWt"]}g`);
  if (raw["SalesTouch"]) lines.push(`Touch: ${raw["SalesTouch"]}`);
  if (raw["ItemName"]) lines.push(`Item: ${raw["ItemName"]}`);
  if (raw["DesignName"]) lines.push(`Design: ${raw["DesignName"]}`);
  if (raw["GroupName"]) lines.push(`Group: ${raw["GroupName"]}`);
  if (raw["SubItemName"]) lines.push(`Sub-Item: ${raw["SubItemName"]}`);
  if (raw["Size1"]) lines.push(`Size: ${raw["Size1"]}`);
  if (raw["MetalType"]) lines.push(`Metal: ${raw["MetalType"]}`);
  if (raw["Barcode"]) lines.push(`Barcode: ${raw["Barcode"]}`);
  if (raw["TagSalesAmount"])
    lines.push(`Sales Amount: ₹${raw["TagSalesAmount"]}`);
  if (p.category) lines.push(`Category: ${p.category.name}`);

  return lines.join("\n");
}

export function registerProductTools(server: McpServer) {
  server.tool(
    "get_product_details",
    "Get detailed information about a specific product by its ID. Use this after search_products to get full details of a product.",
    {
      product_id: z.string().describe("The product ID"),
    },
    async ({ product_id }) => {
      try {
        const token = getApiToken();
        const result = await fetchProducts(token, {
          limit: 100,
          showAll: true,
        });
        const product = result.data.find((p) => p.id === product_id);

        if (!product) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Product with ID '${product_id}' not found. Try using search_products first.`,
              },
            ],
          };
        }

        const raw = product.rawData ?? {};
        const details = [
          `=== Product Details ===`,
          `Name: ${product.name}`,
          `ID: ${product.id}`,
          `Tag No: ${product.tagNo ?? "N/A"}`,
          `Karat: ${product.karat ?? "N/A"}`,
          `Active: ${product.isActive ? "Yes" : "No"}`,
          ``,
          `--- Physical Properties ---`,
          `Gross Weight: ${raw["GrossWt"] ?? "N/A"}g`,
          `Fine Weight: ${raw["FineWt"] ?? "N/A"}g`,
          `Touch/Purity: ${raw["SalesTouch"] ?? raw["Touch"] ?? "N/A"}`,
          `Wastage: ${raw["WastagePrc"] ?? "N/A"}%`,
          `Sales Wastage: ${raw["SalesWastagePrc"] ?? "N/A"}%`,
          `Size: ${raw["Size1"] ?? "N/A"}`,
          ``,
          `--- Classification ---`,
          `Item: ${raw["ItemName"] ?? "N/A"}`,
          `Sub-Item: ${raw["SubItemName"] ?? "N/A"}`,
          `Design: ${raw["DesignName"] ?? "N/A"}`,
          `Group: ${raw["GroupName"] ?? "N/A"}`,
          `Metal Type: ${raw["MetalType"] ?? "N/A"}`,
          `Gender: ${raw["GenderName"] ?? "N/A"}`,
          `Design Code: ${raw["DesignCode"] ?? "N/A"}`,
          ``,
          `--- Other ---`,
          `Barcode: ${raw["Barcode"] ?? "N/A"}`,
          `HSN Code: ${raw["HSNCode"] ?? "N/A"}`,
          `Voucher No: ${raw["VoucherNo"] ?? "N/A"}`,
          `Sales Amount: ${raw["TagSalesAmount"] ? `₹${raw["TagSalesAmount"]}` : "N/A"}`,
        ];

        if (product.category) {
          details.push(`Category: ${product.category.name}`);
        }
        if (product.imageUrl) {
          details.push(`Image: ${product.imageUrl}`);
        }

        return {
          content: [
            { type: "text" as const, text: details.join("\n") },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching product details: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get_product_by_barcode",
    "Find a product by its barcode number. Useful when a customer scans or reads a barcode.",
    {
      barcode: z.string().describe("The barcode number to search for"),
    },
    async ({ barcode }) => {
      try {
        const token = getApiToken();
        const result = await searchProducts(token, {
          search: barcode,
          limit: 5,
          showAll: true,
        });

        const match = result.data.find(
          (p: any) => p.rawData?.["Barcode"]?.toString() === barcode
        );

        if (!match) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No product found with barcode '${barcode}'.`,
              },
            ],
          };
        }

        const raw = match.rawData ?? {};
        const details = [
          `=== Product Found (Barcode: ${barcode}) ===`,
          `Name: ${match.name}`,
          `ID: ${match.id}`,
          `Karat: ${match.karat ?? "N/A"}`,
          `Gross Weight: ${raw["GrossWt"] ?? "N/A"}g`,
          `Fine Weight: ${raw["FineWt"] ?? "N/A"}g`,
          `Touch: ${raw["SalesTouch"] ?? raw["Touch"] ?? "N/A"}`,
          `Design: ${raw["DesignName"] ?? "N/A"}`,
          `Item: ${raw["ItemName"] ?? "N/A"}`,
          `Size: ${raw["Size1"] ?? "N/A"}`,
          `Sales Amount: ${raw["TagSalesAmount"] ? `₹${raw["TagSalesAmount"]}` : "N/A"}`,
        ];

        if (match.category) details.push(`Category: ${match.category.name}`);

        return {
          content: [{ type: "text" as const, text: details.join("\n") }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error looking up barcode: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
