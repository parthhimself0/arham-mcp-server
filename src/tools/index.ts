import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProductTools } from "./products.js";
import { registerCategoryTools } from "./categories.js";
import { registerGoldRateTools } from "./gold-rate.js";
import { registerOrderTools } from "./orders.js";
import { registerStoreTools } from "./store.js";

export function registerAllTools(server: McpServer) {
  registerProductTools(server);
  registerCategoryTools(server);
  registerGoldRateTools(server);
  registerOrderTools(server);
  registerStoreTools(server);
}
