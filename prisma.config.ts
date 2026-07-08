import { config } from "dotenv";
import { defineConfig } from "prisma/config";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
const result = config({ path: envPath });

if (result.error) {
  config({ path: ".env" });
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] || "",
  },
});
