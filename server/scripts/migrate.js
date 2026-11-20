// Apply database migrations and exit (the servers also do this when they start).
import { migrate, pool } from "../src/db.js";

await migrate();
await pool.end();
console.log("Database is up to date.");
