import { postgresAdapter } from "@breadcrumb/postgres";

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString.trim() === "")
  throw new Error("DATABASE_URL is required");

const storage = postgresAdapter({ connectionString });
try {
  await storage.migrate();
  console.log("Breadcrumb Vercel gateway database migration complete");
} finally {
  await storage.close();
}
