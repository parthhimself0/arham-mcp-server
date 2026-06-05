import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchUserOrders, createOrder, getApiToken } from "../api-client.js";
import type { UserOrder } from "../types.js";

function formatOrder(order: UserOrder): string {
  const items = order.items
    .map((item) => {
      const lines = [
        `  - ${item.product.name} (x${item.quantity})`,
        `    Price: ₹${item.price}`,
        `    Status: ${item.isRejected ? "Rejected" : "Active"}`,
      ];
      if (item.stockNote) lines.push(`    Note: ${item.stockNote}`);
      return lines.join("\n");
    })
    .join("\n");

  return [
    `Order #${order.orderToken ?? order.id}`,
    `Status: ${order.status}`,
    `Total: ₹${order.totalAmount ?? "N/A"}`,
    `Admin Message: ${order.adminMessage ?? "None"}`,
    `Created: ${new Date(order.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    `Items (${order.items.length}):`,
    items,
  ].join("\n");
}

export function registerOrderTools(server: McpServer) {
  server.tool(
    "get_user_orders",
    "Get order history for a user. Returns a paginated list of orders with their items and status.",
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
        .max(20)
        .optional()
        .describe("Number of orders per page (default 10)"),
    },
    async ({ page, limit }) => {
      try {
        const token = getApiToken();
        const result = await fetchUserOrders(token, {
          page: page ?? 1,
          limit: limit ?? 10,
        });

        if (result.data.length === 0) {
          return {
            content: [
              { type: "text" as const, text: "No orders found." },
            ],
          };
        }

        const formatted = result.data.map(formatOrder).join("\n\n---\n\n");
        const summary = [
          `Order History (Page ${page ?? 1}, ${result.data.length} shown, ${result.meta?.total ?? 0} total):`,
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
              text: `Error fetching orders: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get_order_details",
    "Get details of a specific order from the user's order history. Returns full order info including all items.",
    {
      order_id: z.string().describe("The order ID to look up"),
    },
    async ({ order_id }) => {
      try {
        const token = getApiToken();
        const result = await fetchUserOrders(token, { page: 1, limit: 50 });
        const order = result.data.find((o) => o.id === order_id);

        if (!order) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Order with ID '${order_id}' not found. Use get_user_orders to see available orders.`,
              },
            ],
          };
        }

        return {
          content: [{ type: "text" as const, text: formatOrder(order) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching order details: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "place_order",
    "Place an order for one or more products. IMPORTANT: Ask the user to confirm before placing an order. This action will create a real order in the system.",
    {
      items: z
        .array(
          z.object({
            product_id: z.string().describe("The product ID"),
            quantity: z
              .number()
              .int()
              .min(1)
              .describe("Quantity to order"),
          })
        )
        .min(1)
        .max(20)
        .describe("List of products to order"),
      confirm: z
        .boolean()
        .describe("Set to true only after user explicitly confirms the order"),
    },
    async ({ items, confirm }) => {
      if (!confirm) {
        const itemList = items
          .map((i) => `  - Product ID: ${i.product_id}, Qty: ${i.quantity}`)
          .join("\n");
        return {
          content: [
            {
              type: "text" as const,
              text: `Order summary:\n${itemList}\n\nPlease ask the user to confirm. Call place_order again with confirm=true to proceed.`,
            },
          ],
        };
      }

      try {
        const token = getApiToken();
        const result = await createOrder(
          token,
          items.map((i) => ({ productId: i.product_id, quantity: i.quantity }))
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Order placed successfully!\nOrder ID: ${result.orderId}\nMessage: ${result.message}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to place order: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
