import { database } from "../tests/db-harness";
const db = await database();
console.log(
  "All SQL migrations applied to fresh PostgreSQL (PGlite) successfully.",
);
await db.close();
