import { storage } from "./config.js";

await storage.migrate();
await storage.close();
console.log("Breadcrumb database migration complete");
