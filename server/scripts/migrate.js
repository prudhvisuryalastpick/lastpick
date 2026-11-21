// Apply database migrations and exit (the servers also do this when they start).
import { closePools, migrate } from "../src/db.js";

await migrate();
await closePools();
console.log("Database is up to date.");
