import * as http from "http";
import { fetchProducts, searchProducts, fetchCategories, fetchCurrentGoldRate, fetchGoldRateHistory, fetchUserOrders, createOrder, fetchAncillaryPage } from "./api-client.js";
import type { Product, Category, UserOrder } from "./types.js";

const PORT = parseInt(process.env.PORT || "3001", 10);

function cors(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res: http.ServerResponse, status: number, data: unknown) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function formatProduct(p: Product): string {
  const raw = p.rawData ?? {};
  const lines = [`Name: ${p.name}`, `ID: ${p.id}`, `Karat: ${p.karat ?? "N/A"}`, `Active: ${p.isActive ? "Yes" : "No"}`];
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
  if (raw["TagSalesAmount"]) lines.push(`Sales Amount: ₹${raw["TagSalesAmount"]}`);
  if (p.category) lines.push(`Category: ${p.category.name}`);
  return lines.join("\n");
}

function formatProductShort(p: Product): string {
  const raw = p.rawData ?? {};
  const parts = [`${p.name}`, `${p.karat ?? "N/A"}`];
  if (raw["GrossWt"]) parts.push(`${raw["GrossWt"]}g`);
  if (raw["TagSalesAmount"]) parts.push(`₹${raw["TagSalesAmount"]}`);
  return parts.join(" | ");
}

function formatCategory(c: Category, indent: number = 0): string {
  const prefix = "  ".repeat(indent);
  const lines = [`${prefix}- ${c.name} (ID: ${c.id}, Level: ${c.level ?? "N/A"})`];
  if (c.children) {
    for (const child of c.children) {
      lines.push(formatCategory(child, indent + 1));
    }
  }
  return lines.join("\n");
}

function formatOrder(order: UserOrder): string {
  const items = order.items.map((item) => {
    const lines = [`  - ${item.product.name} (x${item.quantity})`, `    Price: ₹${item.price}`];
    return lines.join("\n");
  }).join("\n");
  return [`Order #${order.orderToken ?? order.id}`, `Status: ${order.status}`, `Total: ₹${order.totalAmount ?? "N/A"}`, `Created: ${new Date(order.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`, `Items:`, items].join("\n");
}

function stripHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<\/li>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n{3,}/g, "\n\n").trim();
}

// Tool definitions for LLM consumption
const TOOLS = [
  {
    name: "search_products",
    description: "Search for jewellery products by name, karat, or category. Returns a list of matching products with key details.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search term (e.g. 'ring', 'chain', 'bangle')" },
        karat: { type: "string", description: "Filter by karat purity: '18', '20', '22'" },
        category_id: { type: "string", description: "Filter by category ID" },
        limit: { type: "number", description: "Max results (default 20, max 50)" },
      },
    },
  },
  {
    name: "get_product_details",
    description: "Get detailed information about a specific product by its ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_id: { type: "string", description: "The product ID" },
      },
      required: ["product_id"],
    },
  },
  {
    name: "get_product_by_barcode",
    description: "Find a product by its barcode number.",
    input_schema: {
      type: "object" as const,
      properties: {
        barcode: { type: "string", description: "The barcode number" },
      },
      required: ["barcode"],
    },
  },
  {
    name: "get_categories",
    description: "Browse categories step by step. Call with no params to see Karat options (Level 1). Pass parent_id to see its children (Level 2=Collection or Level 3=Style). Only Level 3 IDs work with get_category_products.",
    input_schema: {
      type: "object" as const,
      properties: {
        parent_id: { type: "string", description: "Parent category ID to get children. Omit to get Level 1 (Karat) options." },
        level: { type: "number", description: "Filter by level: 1=Karat, 2=Collection, 3=Style" },
      },
    },
  },
  {
    name: "get_category_products",
    description: "Get products in a category. category_id MUST be a Level 3 ID. Use get_categories with parent_id to drill down to Level 3 first.",
    input_schema: {
      type: "object" as const,
      properties: {
        category_id: { type: "string", description: "A Level 3 (Style) category ID" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: ["category_id"],
    },
  },
  {
    name: "get_current_gold_rate",
    description: "Get the current gold rate per gram.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_gold_rate_history",
    description: "Get historical gold rates.",
    input_schema: {
      type: "object" as const,
      properties: {
        page: { type: "number", description: "Page number (default 1)" },
        limit: { type: "number", description: "Entries per page (default 10)" },
      },
    },
  },
  {
    name: "get_user_orders",
    description: "Get order history for the user.",
    input_schema: {
      type: "object" as const,
      properties: {
        page: { type: "number", description: "Page number (default 1)" },
        limit: { type: "number", description: "Orders per page (default 10)" },
      },
    },
  },
  {
    name: "get_order_details",
    description: "Get details of a specific order.",
    input_schema: {
      type: "object" as const,
      properties: {
        order_id: { type: "string", description: "The order ID" },
      },
      required: ["order_id"],
    },
  },
  {
    name: "place_order",
    description: "Place an order for products. Ask user to confirm first.",
    input_schema: {
      type: "object" as const,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              product_id: { type: "string" },
              quantity: { type: "number" },
            },
          },
          description: "List of products to order",
        },
        confirm: { type: "boolean", description: "Set to true only after user confirms" },
      },
      required: ["items", "confirm"],
    },
  },
  {
    name: "get_store_info",
    description: "Get store information (about, contact, terms, etc.)",
    input_schema: {
      type: "object" as const,
      properties: {
        page: { type: "string", enum: ["ABOUT", "CONTACT", "TERMS", "PRIVACY", "REFUND", "CITY_POLICY"], description: "Which page to fetch" },
      },
    },
  },
];

async function executeTool(toolName: string, args: Record<string, unknown>, token: string): Promise<string> {
  switch (toolName) {
    case "search_products": {
      let products: Product[] = [];
      if (args.query || args.karat) {
        const searchTerm = args.query && args.karat ? `${args.query} ${args.karat}` : (args.query as string ?? args.karat as string);
        const result = await searchProducts(token, { search: searchTerm, limit: (args.limit as number) ?? 20, showAll: true });
        products = result.data;
      } else if (args.category_id) {
        const result = await fetchProducts(token, { categoryId: args.category_id as string, limit: (args.limit as number) ?? 20, showAll: true });
        products = result.data;
      } else {
        const result = await fetchProducts(token, { limit: (args.limit as number) ?? 20, showAll: true });
        products = result.data;
      }
      if (products.length === 0) return "No products found matching your criteria.";
      return `Found ${products.length} product(s):\n\n${products.map(formatProduct).join("\n\n---\n\n")}`;
    }

    case "get_product_details": {
      const result = await fetchProducts(token, { limit: 100, showAll: true });
      const product = result.data.find((p) => p.id === args.product_id);
      if (!product) return `Product with ID '${args.product_id}' not found.`;
      const raw = product.rawData ?? {};
      return [
        `=== Product Details ===`, `Name: ${product.name}`, `ID: ${product.id}`, `Tag No: ${product.tagNo ?? "N/A"}`, `Karat: ${product.karat ?? "N/A"}`, ``,
        `--- Physical ---`, `Gross Weight: ${raw["GrossWt"] ?? "N/A"}g`, `Fine Weight: ${raw["FineWt"] ?? "N/A"}g`, `Touch: ${raw["SalesTouch"] ?? "N/A"}`, `Wastage: ${raw["WastagePrc"] ?? "N/A"}%`, `Size: ${raw["Size1"] ?? "N/A"}`, ``,
        `--- Classification ---`, `Item: ${raw["ItemName"] ?? "N/A"}`, `Sub-Item: ${raw["SubItemName"] ?? "N/A"}`, `Design: ${raw["DesignName"] ?? "N/A"}`, `Group: ${raw["GroupName"] ?? "N/A"}`, `Metal: ${raw["MetalType"] ?? "N/A"}`, ``,
        `Barcode: ${raw["Barcode"] ?? "N/A"}`, `Amount: ${raw["TagSalesAmount"] ? `₹${raw["TagSalesAmount"]}` : "N/A"}`,
        product.category ? `Category: ${product.category.name}` : "",
      ].filter(Boolean).join("\n");
    }

    case "get_product_by_barcode": {
      const result = await searchProducts(token, { search: args.barcode as string, limit: 5, showAll: true });
      const match = result.data.find((p) => p.rawData?.["Barcode"]?.toString() === args.barcode);
      if (!match) return `No product found with barcode '${args.barcode}'.`;
      const raw = match.rawData ?? {};
      return [`=== Barcode: ${args.barcode} ===`, `Name: ${match.name}`, `ID: ${match.id}`, `Karat: ${match.karat ?? "N/A"}`, `Gross Weight: ${raw["GrossWt"] ?? "N/A"}g`, `Fine Weight: ${raw["FineWt"] ?? "N/A"}g`, `Touch: ${raw["SalesTouch"] ?? "N/A"}`, `Design: ${raw["DesignName"] ?? "N/A"}`, `Amount: ${raw["TagSalesAmount"] ? `₹${raw["TagSalesAmount"]}` : "N/A"}`, match.category ? `Category: ${match.category.name}` : ""].filter(Boolean).join("\n");
    }

    case "get_categories": {
      const categories = await fetchCategories(token, {
        tree: false,
        parentId: args.parent_id as string | undefined,
        level: args.level != null ? Number(args.level) : undefined,
      });
      if (categories.length === 0) return "No categories found.";
      const levelLabel = args.level === 1 ? "Karat" : args.level === 2 ? "Collection" : args.level === 3 ? "Style" : "categories";
      return `${levelLabel} (${categories.length}):\n\n${categories.map((c) => formatCategory(c)).join("\n\n")}`;
    }

    case "get_category_products": {
      const result = await fetchProducts(token, { categoryId: args.category_id as string, limit: (args.limit as number) ?? 20, showAll: true });
      if (result.data.length === 0) return `No products found for category '${args.category_id}'. Use a Level 3 ID.`;
      return `Products (${result.data.length}):\n\n${result.data.map(formatProductShort).join("\n")}`;
    }

    case "get_current_gold_rate": {
      const rate = await fetchCurrentGoldRate(token);
      if (!rate) return "Unable to fetch current gold rate.";
      return `Current Gold Rate\nRate per Gram: ₹${rate.ratePerGram}\nSet By: ${rate.setBy ?? "N/A"}\nLast Updated: ${new Date(rate.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`;
    }

    case "get_gold_rate_history": {
      const history = await fetchGoldRateHistory(token, (args.page as number) ?? 1, (args.limit as number) ?? 10);
      if (history.length === 0) return "No gold rate history available.";
      return `Gold Rate History:\n\n${history.map((r) => `₹${r.ratePerGram}/gram | ${r.setBy ?? "N/A"} | ${new Date(r.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`).join("\n")}`;
    }

    case "get_user_orders": {
      const result = await fetchUserOrders(token, { page: (args.page as number) ?? 1, limit: (args.limit as number) ?? 10 });
      if (result.data.length === 0) return "No orders found.";
      return `Order History (${result.data.length}):\n\n${result.data.map(formatOrder).join("\n\n---\n\n")}`;
    }

    case "get_order_details": {
      const result = await fetchUserOrders(token, { page: 1, limit: 50 });
      const order = result.data.find((o) => o.id === args.order_id);
      if (!order) return `Order '${args.order_id}' not found.`;
      return formatOrder(order);
    }

    case "place_order": {
      const items = args.items as Array<{ product_id: string; quantity: number }>;
      if (!args.confirm) {
        return `Order summary:\n${items.map((i) => `  - Product: ${i.product_id}, Qty: ${i.quantity}`).join("\n")}\n\nPlease confirm to proceed.`;
      }
      try {
        const result = await createOrder(token, items.map((i) => ({ productId: i.product_id, quantity: i.quantity })));
        return `Order placed!\nOrder ID: ${result.orderId}\nMessage: ${result.message}`;
      } catch (error) {
        return `Failed to place order: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    case "get_store_info": {
      const PAGE_KEYS = ["TERMS", "ABOUT", "CONTACT", "PRIVACY", "REFUND", "CITY_POLICY"] as const;
      const PAGE_LABELS: Record<string, string> = { TERMS: "Terms & Conditions", ABOUT: "About Us", CONTACT: "Contact Information", PRIVACY: "Privacy Policy", REFUND: "Refund Policy", CITY_POLICY: "City Policy" };
      const pagesToFetch = args.page ? [args.page as string] : [...PAGE_KEYS];
      const results: string[] = [];
      for (const key of pagesToFetch) {
        const data = await fetchAncillaryPage(token, key);
        if (data) {
          results.push(`=== ${PAGE_LABELS[key] ?? key} ===\n${data.content ? stripHtml(data.content) : "No content"}`);
        }
      }
      return results.length > 0 ? results.join("\n\n") : "Store information unavailable.";
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === "/health") {
    json(res, 200, { status: "ok", server: "arham-jewellers-mcp", version: "1.0.0" });
    return;
  }

  // List tools
  if (url.pathname === "/tools" && req.method === "GET") {
    json(res, 200, { tools: TOOLS });
    return;
  }

  // Execute tool
  if (url.pathname === "/execute" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const { tool, arguments: args, token } = body;

      if (!tool) { json(res, 400, { error: "Missing 'tool' field" }); return; }
      if (!token) { json(res, 400, { error: "Missing 'token' field" }); return; }

      const result = await executeTool(tool, args ?? {}, token);
      json(res, 200, { result });
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  json(res, 404, { error: "Not found. Use /tools or /execute" });
});

server.listen(PORT, () => {
  console.error(`Arham MCP HTTP Server running on http://localhost:${PORT}`);
  console.error(`  GET  /tools     - List tool definitions`);
  console.error(`  POST /execute   - Execute a tool`);
  console.error(`  GET  /health    - Health check`);
});
