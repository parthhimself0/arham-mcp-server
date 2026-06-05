async function getToken() {
  const baseUrl = process.env.API_BASE_URL;
  const phoneNumber = process.env.LOGIN_PHONE;
  const password = process.env.LOGIN_PASSWORD;
  const deviceId = process.env.LOGIN_DEVICE_ID || "mcp-server-device";

  if (!baseUrl) {
    console.error("Error: API_BASE_URL not found in .env");
    process.exit(1);
  }

  if (!phoneNumber || !password) {
    console.error(`
Usage:
  LOGIN_PHONE=9999999999 LOGIN_PASSWORD=yourpass npm run get-token

For admin token:
  LOGIN_PHONE=9999999999 LOGIN_PASSWORD=yourpass LOGIN_ROLE=admin npm run get-token
`);
    process.exit(1);
  }

  const role = process.env.LOGIN_ROLE === "admin" ? "admin-login" : "user-login";

  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/${role}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber, password, deviceId }),
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
      console.error("Login failed:", data.message || response.statusText);
      process.exit(1);
    }

    const token = data.data?.accessToken;
    if (!token) {
      console.error("No accessToken in response:", JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log(`\nYour API_SERVICE_TOKEN:\n${token}\n`);
    console.log(`Add this to your .env file:`);
    console.log(`API_SERVICE_TOKEN=${token}\n`);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

getToken();
