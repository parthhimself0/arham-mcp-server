import * as http from "http";
import { Agent, Runner, setTracingDisabled, setOpenAIAPI, tool } from "@openai/agents";
import {
  fetchProducts,
  fetchCategories,
  fetchCurrentGoldRate,
  fetchGoldRateHistory,
  fetchUserOrders,
  fetchAncillaryPage,
  setApiToken,
  getApiToken,
} from "./api-client.js";
import type { Product } from "./types.js";

const PORT = parseInt(process.env.AGENT_PORT || "3001", 10);
const LLM_MODEL = process.env.LLM_MODEL ?? "mimo-v2.5";

if (!process.env.LLM_BASE_URL || !process.env.LLM_API_KEY) {
  console.error("Missing LLM_BASE_URL or LLM_API_KEY in .env");
  process.exit(1);
}

setTracingDisabled(true);
setOpenAIAPI("chat_completions");

// ── Tool label map for streaming ─────────────────────────────
const TOOL_LABELS: Record<string, string> = {
  search_products: "Searching products",
  get_product_details: "Fetching product details",
  get_product_by_barcode: "Looking up barcode",
  get_categories: "Loading categories",
  get_category_products: "Browsing category",
  get_current_gold_rate: "Checking gold rate",
  get_gold_rate_history: "Fetching rate history",
  get_user_orders: "Fetching your orders",
  get_order_details: "Looking up order",
  get_store_info: "Loading store info",
};

// ── Helpers ──────────────────────────────────────────────────
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
  if (raw["TagSalesAmount"]) lines.push(`Sales Amount: ₹${raw["TagSalesAmount"]}`);
  if (p.category) lines.push(`Category: ${p.category.name}`);
  return lines.join("\n");
}

function stripHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n{3,}/g, "\n\n").trim();
}

// JSON Schema helper — ensures required + additionalProperties
function schema(props: Record<string, any>, required: string[] = []): any {
  return { type: "object", properties: props, required, additionalProperties: false };
}

// ── Tools with raw JSON schemas ──────────────────────────────
const tools = [
  tool({
    name: "get_product_details",
    description: "Get detailed information about a specific product by ID.",
    parameters: schema({ product_id: { type: "string", description: "The product ID" } }, ["product_id"]),
    execute: async (args: any) => {
      const token = getApiToken();
      const r = await fetchProducts(token, { limit: 100, showAll: true });
      const p = r.data.find((x) => x.id === args.product_id);
      if (!p) return `Product '${args.product_id}' not found.`;
      const raw = p.rawData ?? {};
      return [
        `=== Product Details ===`, `Name: ${p.name}`, `ID: ${p.id}`, `Tag No: ${p.tagNo ?? "N/A"}`, `Karat: ${p.karat ?? "N/A"}`, ``,
        `Gross Weight: ${raw["GrossWt"] ?? "N/A"}g`, `Fine Weight: ${raw["FineWt"] ?? "N/A"}g`, `Touch: ${raw["SalesTouch"] ?? "N/A"}`, `Size: ${raw["Size1"] ?? "N/A"}`, ``,
        `Item: ${raw["ItemName"] ?? "N/A"}`, `Design: ${raw["DesignName"] ?? "N/A"}`, `Group: ${raw["GroupName"] ?? "N/A"}`, `Metal: ${raw["MetalType"] ?? "N/A"}`, ``,
        `Barcode: ${raw["Barcode"] ?? "N/A"}`, `Amount: ${raw["TagSalesAmount"] ? `₹${raw["TagSalesAmount"]}` : "N/A"}`,
        p.category ? `Category: ${p.category.name}` : "",
      ].filter(Boolean).join("\n");
    },
  }),

  tool({
    name: "get_categories",
    description: "Browse categories step by step. Call with no params to see Karat options (Level 1). Pass parent_id to see its children (Level 2=Collection or Level 3=Style). Only Level 3 IDs work with get_category_products.",
    parameters: schema({
      parent_id: { type: "string", description: "Parent category ID to get children. Omit to get Level 1 (Karat) options." },
      level: { type: "number", description: "Filter by level: 1=Karat, 2=Collection, 3=Style" },
    }),
    execute: async (args: any) => {
      const token = getApiToken();
      const categories = await fetchCategories(token, {
        tree: false,
        parentId: args.parent_id,
        level: args.level != null ? Number(args.level) : undefined,
      });
      if (categories.length === 0) return "No categories found.";
      function fmt(c: any, indent = 0): string {
        const p = "  ".repeat(indent);
        const lines = [`${p}- ${c.name} (ID: ${c.id}, Level: ${c.level ?? "N/A"})`];
        if (c.children) for (const ch of c.children) lines.push(fmt(ch, indent + 1));
        return lines.join("\n");
      }
      const levelLabel = args.level === 1 ? "Karat" : args.level === 2 ? "Collection" : args.level === 3 ? "Style" : "categories";
      return `${levelLabel} (${categories.length}):\n\n${categories.map(fmt).join("\n\n")}`;
    },
  }),

  tool({
    name: "get_category_products",
    description: "Get products in a category. category_id MUST be a Level 3 ID. Use get_categories with parent_id to drill down to Level 3 first.",
    parameters: schema({
      category_id: { type: "string", description: "A Level 3 category ID" },
      limit: { type: "number", description: "Max results, default 20" },
    }, ["category_id"]),
    execute: async (args: any) => {
      const token = getApiToken();
      const limit = Number(args.limit) || 20;
      const r = await fetchProducts(token, { categoryId: args.category_id, limit, showAll: true });
      if (r.data.length === 0) return `No products for category '${args.category_id}'. Use a Level 3 ID.`;
      return `Products (${r.data.length}):\n\n${r.data.map((p) => `${p.name} | ${p.karat ?? "N/A"} | ${p.rawData?.["GrossWt"] ?? ""}g | ${p.rawData?.["TagSalesAmount"] ? `₹${p.rawData["TagSalesAmount"]}` : ""}`).join("\n")}`;
    },
  }),

  tool({
    name: "get_current_gold_rate",
    description: "Get the current gold rate per gram.",
    parameters: schema({}),
    execute: async () => {
      const token = getApiToken();
      const rate = await fetchCurrentGoldRate(token);
      if (!rate) return "Unable to fetch current gold rate.";
      return `Current Gold Rate\nRate per Gram: ₹${rate.ratePerGram}\nSet By: ${rate.setBy ?? "N/A"}\nLast Updated: ${new Date(rate.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`;
    },
  }),

  tool({
    name: "get_gold_rate_history",
    description: "Get historical gold rates.",
    parameters: schema({
      page: { type: "number", description: "Page number, default 1" },
      limit: { type: "number", description: "Entries per page, default 10" },
    }),
    execute: async (args: any) => {
      const token = getApiToken();
      const history = await fetchGoldRateHistory(token, Number(args.page) || 1, Number(args.limit) || 10);
      if (history.length === 0) return "No gold rate history available.";
      return `Gold Rate History:\n\n${history.map((r) => `₹${r.ratePerGram}/gram | ${r.setBy ?? "N/A"} | ${new Date(r.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`).join("\n")}`;
    },
  }),

  tool({
    name: "get_user_orders",
    description: "Get order history for the user.",
    parameters: schema({
      page: { type: "number", description: "Page number, default 1" },
      limit: { type: "number", description: "Orders per page, default 10" },
    }),
    execute: async (args: any) => {
      const token = getApiToken();
      const result = await fetchUserOrders(token, { page: Number(args.page) || 1, limit: Number(args.limit) || 10 });
      if (result.data.length === 0) return "No orders found for this account.";
      return `Order History (${result.data.length}):\n\n${result.data.map((o) => {
        const items = o.items.map((i) => `  - ${i.product.name} (x${i.quantity}) ₹${i.price}`).join("\n");
        return `Order #${o.orderToken ?? o.id}\nStatus: ${o.status}\nTotal: ₹${o.totalAmount ?? "N/A"}\nCreated: ${new Date(o.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\nItems:\n${items}`;
      }).join("\n\n---\n\n")}`;
    },
  }),

  tool({
    name: "get_store_info",
    description: "Get store information (about, contact, terms, etc.)",
    parameters: schema({
      page: { type: "string", description: "Which page: ABOUT, CONTACT, TERMS, PRIVACY, REFUND, CITY_POLICY" },
    }),
    execute: async (args: any) => {
      const token = getApiToken();
      const PAGE_KEYS = ["TERMS", "ABOUT", "CONTACT", "PRIVACY", "REFUND", "CITY_POLICY"] as const;
      const LABELS: Record<string, string> = { TERMS: "Terms & Conditions", ABOUT: "About Us", CONTACT: "Contact", PRIVACY: "Privacy Policy", REFUND: "Refund Policy", CITY_POLICY: "City Policy" };
      const pages = args.page ? [args.page] : [...PAGE_KEYS];
      const results: string[] = [];
      for (const key of pages) {
        const data = await fetchAncillaryPage(token, key);
        if (data) results.push(`=== ${LABELS[key] ?? key} ===\n${data.content ? stripHtml(data.content) : "No content"}`);
      }
      return results.length > 0 ? results.join("\n\n") : "Store information unavailable.";
    },
  }),
];

// ── Agent ────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Arham Jewellers' AI shopping assistant. You help customers browse jewellery, check gold rates, track orders, and make purchases.

IMPORTANT: You MUST use the provided tools to answer questions. Do NOT say you cannot access data — you have tools for products, categories, gold rates, orders, and store info. Always call the appropriate tool.

RULES:
- Be helpful, friendly, and professional
- When showing products, format them clearly with name, weight, karat, and price
- Only Level 3 category IDs can be used to fetch products
- Always ask for confirmation before placing an order
- If a tool returns an error or empty results, say so clearly — do NOT say "technical difficulty"
- Keep responses concise and well-formatted

CATEGORY BROWSING (lazy loading — fetch only what you need):
1. Call get_categories with NO params to see Karat options (Level 1: 18K, 20K, 22K)
2. Ask the user which karat they prefer, or if they have a style/collection in mind
3. Call get_categories with parent_id of their chosen karat to see Collections (Level 2)
4. Ask which collection they like, or drill down further
5. Call get_categories with parent_id of a collection to see Styles (Level 3)
6. Use the Level 3 ID with get_category_products to show products

If the user already mentions a specific style (e.g. "show me fancy tikki sets"), you can skip steps and search directly. But when browsing, always ask what they are looking for before making multiple API calls.`;

const agent = new Agent({
  name: "Arham Jewellers Assistant",
  instructions: SYSTEM_PROMPT,
  model: LLM_MODEL,
  tools,
});

// ── Conversation history per session ─────────────────────────
const conversations = new Map<string, string[]>();

function getHistory(sid: string): string[] {
  if (!conversations.has(sid)) conversations.set(sid, []);
  return conversations.get(sid)!;
}

// ── HTTP helpers ─────────────────────────────────────────────
function cors(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function jsonResponse(res: http.ServerResponse, status: number, data: unknown) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => { try { resolve(JSON.parse(body)); } catch { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}

// ── Server ───────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/health") {
    jsonResponse(res, 200, { status: "ok", service: "arham-agent", version: "3.0.0" });
    return;
  }

  // Non-streaming chat
  if (url.pathname === "/chat" && req.method === "POST") {
    try {
      const { message, sessionId, token } = await parseBody(req);
      if (!message) { jsonResponse(res, 400, { error: "Missing 'message'" }); return; }
      if (token) setApiToken(token);

      const sid = sessionId ?? "default";
      const history = getHistory(sid);
      const ctx = history.length > 0 ? `\n\nPrevious conversation:\n${history.join("\n")}` : "";

      const runner = new Runner();
      const result = await runner.run(agent, `${message}${ctx}`);
      const response = result.finalOutput ?? "I couldn't process your request.";

      history.push(`Customer: ${message}`);
      history.push(`Assistant: ${response}`);
      if (history.length > 40) history.splice(0, history.length - 40);

      jsonResponse(res, 200, { response });
    } catch (error) {
      console.error("Chat error:", error);
      jsonResponse(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  // SSE streaming chat
  if (url.pathname === "/chat/stream" && req.method === "POST") {
    try {
      const { message, sessionId, token } = await parseBody(req);
      if (!message) { jsonResponse(res, 400, { error: "Missing 'message'" }); return; }
      if (token) setApiToken(token);

      const sid = sessionId ?? "default";
      const history = getHistory(sid);
      const ctx = history.length > 0 ? `\n\nPrevious conversation:\n${history.join("\n")}` : "";

      cors(res);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });

      const runner = new Runner();
      const stream = await runner.run(agent, `${message}${ctx}`, { stream: true });

      let fullResponse = "";

      for await (const event of stream) {
        // Tool call events
        if (event.type === "run_item_stream_event" && event.name === "tool_called") {
          const toolItem = event.item as any;
          const name = toolItem?.name ?? "";
          const label = TOOL_LABELS[name] ?? name;
          res.write(`data: ${JSON.stringify({ type: "tool_call", tool: name, label })}\n\n`);
        }

        // Text delta events
        if (event.type === "raw_model_stream_event") {
          const data = event.data as any;
          if (data?.type === "output_text_delta" && data?.delta) {
            fullResponse += data.delta;
            res.write(`data: ${JSON.stringify({ type: "text_delta", content: data.delta })}\n\n`);
          }
        }
      }

      history.push(`Customer: ${message}`);
      history.push(`Assistant: ${fullResponse}`);
      if (history.length > 40) history.splice(0, history.length - 40);

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Stream error:", error);
      try {
        res.write(`data: ${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : String(error) })}\n\n`);
        res.end();
      } catch {}
    }
    return;
  }

  if (url.pathname === "/clear" && req.method === "POST") {
    try {
      const { sessionId } = await parseBody(req);
      conversations.delete(sessionId ?? "default");
    } catch {}
    jsonResponse(res, 200, { ok: true });
    return;
  }

  jsonResponse(res, 404, { error: "Not found. Use POST /chat, POST /chat/stream, POST /clear, or GET /health" });
});

server.listen(PORT, () => {
  console.error(`Arham Agent Service running on http://localhost:${PORT}`);
  console.error(`  POST /chat         — Send message, get response`);
  console.error(`  POST /chat/stream  — Send message, get SSE stream`);
  console.error(`  POST /clear        — Clear conversation history`);
  console.error(`  GET  /health       — Health check`);
});
