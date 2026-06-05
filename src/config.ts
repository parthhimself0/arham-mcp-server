function getEnvVar(name: string, required: boolean = true): string {
  const value = process.env[name];
  if (!value && required) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const config = {
  apiBaseUrl: getEnvVar("API_BASE_URL"),
  apiServiceToken: getEnvVar("API_SERVICE_TOKEN", false),
} as const;
