# Arham Jewellers MCP Server

MCP (Model Context Protocol) server for the Arham Jewellers customer AI assistant. Exposes tools for searching products, browsing categories, checking gold rates, tracking orders, placing orders, and getting store info.

## Prerequisites

- Node.js 18+ (uses built-in `fetch`)
- A running Arham Jewellers backend API

## Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API_BASE_URL

# Build
npm run build
```

## Configuration

Create a `.env` file — only the API base URL is needed (token is passed per request):

```
API_BASE_URL=https://arham-jewellers-backend.onrender.com
```

## Running

```bash
npm start
```

## Get a Token

```bash
# Admin login (phone must include +91 prefix)
LOGIN_PHONE=+919879879870 LOGIN_PASSWORD=Admin@1234 npm run get-token

# User login
LOGIN_PHONE=+919879879870 LOGIN_PASSWORD=yourpass npm run get-token
```

## Available Tools (11)

All tools require a `token` parameter (JWT) passed by the MCP client with each request.

| Tool | Description |
|---|---|
| `search_products` | Search products by name, karat, or category |
| `get_product_details` | Get full details of a specific product |
| `get_product_by_barcode` | Find a product by barcode number |
| `get_categories` | Get the hierarchical category tree (Level 1=Karat, 2=Collection, 3=Style) |
| `get_category_products` | List products in a Level 3 category |
| `get_current_gold_rate` | Get today's gold rate per gram |
| `get_gold_rate_history` | Get historical gold rates |
| `get_user_orders` | Get order history |
| `get_order_details` | Get details of a specific order |
| `place_order` | Place an order (requires user confirmation) |
| `get_store_info` | Get store info (About, Contact, Terms, etc.) |

### Important Notes

- **Category levels**: Only Level 3 (Style) category IDs return products. Use `get_categories(level=3)` to find valid IDs.
- **Order placement**: `place_order` uses a two-step confirm flow — the AI must ask the user before setting `confirm=true`.
- **Gold rate**: The `/api/v1/gold-rate/current` endpoint may not be available on all backend versions.

## Connect to MCP Clients

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "arham-jewellers": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/arham-mcp-server/.env",
        "/absolute/path/to/arham-mcp-server/build/index.js"
      ]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "arham-jewellers": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/arham-mcp-server/.env",
        "/absolute/path/to/arham-mcp-server/build/index.js"
      ]
    }
  }
}
```

## Project Structure

```
src/
├── index.ts          # Entry point (MCP server + STDIO transport)
├── config.ts         # Environment variable loader
├── api-client.ts     # HTTP client for backend API (token passed per call)
├── types.ts          # TypeScript interfaces
└── tools/
    ├── index.ts      # Tool registry
    ├── products.ts   # search_products, get_product_details, get_product_by_barcode
    ├── categories.ts # get_categories, get_category_products
    ├── gold-rate.ts  # get_current_gold_rate, get_gold_rate_history
    ├── orders.ts     # get_user_orders, get_order_details, place_order
    └── store.ts      # get_store_info
```
