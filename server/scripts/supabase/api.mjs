// Runs SQL on the LastPick Supabase database through Supabase's Management API (needs only SUPABASE_ACCESS_TOKEN
// and SUPABASE_PROJECT_ID; no database password).
import process from "node:process";

export async function sql(query) {
  const { SUPABASE_ACCESS_TOKEN: token, SUPABASE_PROJECT_ID: ref } = process.env;
  if (!token || !ref) throw new Error("Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID");
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`SQL failed (${r.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}
