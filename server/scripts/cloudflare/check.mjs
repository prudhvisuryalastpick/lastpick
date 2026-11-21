// Explains Cloudflare access problems before publishing: is the token active, which accounts can it see, does the
// saved account ID match one of them, and may it manage Workers there. Prints names and yes/no only (no IDs, no token).
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
const cf = async (p) => { const r = await fetch(`https://api.cloudflare.com/client/v4${p}`, { headers: { Authorization: `Bearer ${token}` } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

const verify = await cf("/user/tokens/verify");
console.log("token active:", verify.body?.result?.status === "active" ? "yes" : `no (${verify.status})`);
const accounts = (await cf("/accounts?per_page=50")).body?.result || [];
console.log("accounts this token can see:", accounts.length ? accounts.map((a) => a.name).join(", ") : "none");
const match = accounts.find((a) => a.id === account);
console.log("CLOUDFLARE_ACCOUNT_ID matches one of them:", match ? `yes (${match.name})` : "NO");
const zones = (await cf("/zones?name=lastpick.in")).body?.result || [];
console.log("lastpick.in visible to the token:", zones.length ? `yes (status: ${zones[0].status}, account: ${zones[0].account?.name})` : "NO");
if (zones[0] && zones[0].account?.id !== account) console.log("NOTE: lastpick.in is in a different account than CLOUDFLARE_ACCOUNT_ID");
const scripts = await cf(`/accounts/${account}/workers/scripts`);
console.log("may manage Workers in that account:", scripts.status === 200 ? "yes" : `NO (${scripts.status}: ${scripts.body?.errors?.map((e) => e.message).join("; ")})`);
