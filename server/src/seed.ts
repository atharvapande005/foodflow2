import { connectDB, disconnectDB } from "./config/db.js";
import { seedIfEmpty } from "./seedIfEmpty.js";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  await connectDB();
  console.log("[Seed] Connected to database");
  await seedIfEmpty();
  console.log("[Seed] Done");
  await disconnectDB();
  process.exit(0);
}

run().catch((err) => {
  console.error("[Seed] Failed", err);
  process.exit(1);
});