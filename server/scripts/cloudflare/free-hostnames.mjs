// The sites need customer./partner./admin.lastpick.in (and lastpick.in / www for the redirect) free of other DNS
// records. Deletes ONLY old records that point at Amazon (the retired AWS setup); anything else is reported, not touched.
const { CLOUDFLARE_API_TOKEN: token } = process.env;
const cf = async (method, p) => { const r = await fetch(`https://api.cloudflare.com/client/v4${p}`, { method, headers: { Authorization: `Bearer ${token}` } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const zone = (await cf("GET", "/zones?name=lastpick.in")).body?.result?.[0];
if (!zone) { console.log("lastpick.in not visible to the token; skipping"); process.exit(0); }
for (const host of ["customer", "partner", "admin", "www", ""].map((h) => (h ? `${h}.lastpick.in` : "lastpick.in"))) {
  const list = await cf("GET", `/zones/${zone.id}/dns_records?name=${host}&per_page=50`);
  if (list.status !== 200) { console.log(`${host}: can't read DNS (${list.status}); add "Zone · DNS · Edit" to the token or delete old records by hand`); continue; }
  for (const r of list.body.result.filter((x) => ["A", "AAAA", "CNAME"].includes(x.type))) {
    if (/amazonaws\.com\.?$|cloudfront\.net\.?$/i.test(r.content)) {
      const del = await cf("DELETE", `/zones/${zone.id}/dns_records/${r.id}`);
      console.log(`${host}: ${del.status === 200 ? "removed" : `could not remove (${del.status})`} old AWS ${r.type} record`);
    } else if (!r.meta?.read_only) {
      console.log(`${host}: has a ${r.type} record pointing to ${r.content} (left as is)`);
    }
  }
}
