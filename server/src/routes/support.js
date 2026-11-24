// Customer and partner support: ask for help in the app, the LastPick team answers in the same conversation.
// (Formal complaints with legal deadlines stay in /api/grievances.)
import { needUser } from "../auth.js";
import { MAIL_REPLY_TO, SERVICE } from "../config.js";
import { mailProvider, sendEmail } from "../mail.js";
import { log } from "../log.js";
import { many, one, q, tx } from "../db.js";
import { limit } from "../ratelimit.js";
import { audit } from "../shared.js";
import { bad, denied, ms, needUuid, notFound, str } from "../util.js";

export const SUPPORT_TOPICS = [
  "Using the app", "Login or account", "An offer or business", "A customer or lead", "Posting offers",
  "Business verification", "Plans and payments", "Safety concern", "Something else",
];
export const CALLBACK_TOPICS = { customer: ["An offer or shop", "Plans and payments", "My account", "Something else"], partner: ["Plans and payments", "Business verification", "Posting offers", "Something else"] };
export const CALLBACK_TIMES = ["Morning", "Afternoon", "Evening"];
const mapCallback = (c) => ({
  id: c.id, role: c.role, topic: c.topic, bestTime: c.best_time, note: c.note, status: c.status, createdAt: ms(c.created_at), doneAt: ms(c.done_at),
  user: c.u_email !== undefined ? { name: c.u_name || "", email: c.u_email || "", phone: c.u_phone || "", business: c.b_name || "", area: c.b_area || "" } : undefined,
});
const mapTicket = (t) => ({
  id: t.id, topic: t.topic, status: t.status, role: t.role, createdAt: ms(t.created_at), updatedAt: ms(t.updated_at),
  lastMessage: t.last_body || "", lastFromStaff: !!t.last_staff,
  user: t.u_email !== undefined ? { name: t.u_name || "", email: t.u_email || "", phone: t.u_phone || "" } : undefined,
});
const LAST = `(SELECT body FROM support_messages m WHERE m.ticket_id = t.id ORDER BY id DESC LIMIT 1) AS last_body,
              (SELECT from_staff FROM support_messages m WHERE m.ticket_id = t.id ORDER BY id DESC LIMIT 1) AS last_staff`;

async function thread(id) {
  const msgs = await many("SELECT from_staff, body, created_at FROM support_messages WHERE ticket_id = $1 ORDER BY id", [id]);
  return msgs.map((m) => ({ fromStaff: m.from_staff, body: m.body, at: ms(m.created_at) }));
}

export function supportRoutes(r, { admin }) {
  // ---------- customers and partners ----------
  r.post("/api/support", async (ctx) => {
    const u = needUser(ctx);
    await limit(u.id, "support", 10, 86400);
    const topic = SUPPORT_TOPICS.includes(ctx.body.topic) ? ctx.body.topic : "Something else";
    const body = str(ctx.body.message, 2000);
    if (body.length < 5) throw bad("Please tell us a little more");
    const role = SERVICE === "partner" || ctx.body.role === "partner" ? "partner" : "customer";
    const id = await tx(async (c) => {
      const biz = (await c.query("SELECT state FROM businesses WHERE id = $1", [u.id])).rows[0];
      const t = (await c.query("INSERT INTO support_tickets (user_id, role, topic, state) VALUES ($1, $2, $3, $4) RETURNING id", [u.id, role, topic, biz?.state || ""])).rows[0];
      await c.query("INSERT INTO support_messages (ticket_id, author_id, body) VALUES ($1, $2, $3)", [t.id, u.id, body]);
      return t.id;
    });
    audit("support_ticket", u.id, { ticket: id, topic });
    return { id };
  }, { limit: "write" });

  // Request a call back: the team calls the number saved on the account (support hours: see SUPPORT_HOURS in web/src/lib/config.js).
  r.post("/api/callbacks", async (ctx) => {
    const u = needUser(ctx);
    const role = SERVICE === "partner" || ctx.body.role === "partner" ? "partner" : "customer";
    const topic = CALLBACK_TOPICS[role].includes(ctx.body.topic) ? ctx.body.topic : "Something else";
    const bestTime = CALLBACK_TIMES.includes(ctx.body.bestTime) ? ctx.body.bestTime : "Morning";
    const note = str(ctx.body.note, 500);
    const me = await one("SELECT u.name, u.email, u.phone, b.name AS b_name, b.area AS b_area, b.state FROM users u LEFT JOIN businesses b ON b.id = u.id WHERE u.id = $1", [u.id]);
    if (!me?.phone) throw bad("Add your phone number in Account first, so we can call you");
    const open = await one("SELECT id FROM callbacks WHERE user_id = $1 AND status = 'new'", [u.id]);
    if (open) return { id: open.id, already: true };
    await limit(u.id, "callback", 3, 86400, "You've asked for a call back a few times today. We'll call you soon.");
    const row = await one("INSERT INTO callbacks (user_id, role, topic, best_time, note, state) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [u.id, role, topic, bestTime, note, me.state || ""]);
    audit("callback_request", u.id, { id: row.id, topic });
    if (mailProvider()) {
      const who = role === "partner" ? `${me.b_name || me.name || "Partner"}${me.b_area ? ` (${me.b_area})` : ""}` : me.name || "Customer";
      try {
        await sendEmail(MAIL_REPLY_TO, `Call back: ${who} · ${topic}`,
          `${who} asked for a call back.\n\nPhone: ${me.phone}\nE-mail: ${me.email}\nAbout: ${topic}\nBest time: ${bestTime}${note ? `\nNote: ${note}` : ""}\n\nMark it done in Admin → Support → Call backs.`);
      } catch (e) { log.warn("callback e-mail failed", { error: e.message }); }
    }
    return { id: row.id };
  }, { limit: "write" });

  r.get("/api/callbacks/mine", async (ctx) => {
    const u = needUser(ctx);
    const c = await one("SELECT * FROM callbacks WHERE user_id = $1 AND status = 'new' ORDER BY created_at DESC LIMIT 1", [u.id]);
    return c ? mapCallback(c) : null;
  });

  r.get("/api/support", async (ctx) => {
    const u = needUser(ctx);
    return (await many(`SELECT t.*, ${LAST} FROM support_tickets t WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50`, [u.id])).map(mapTicket);
  });

  r.get("/api/support/:id", async (ctx) => {
    const u = needUser(ctx);
    const t = await one(`SELECT t.*, ${LAST} FROM support_tickets t WHERE id = $1 AND user_id = $2`, [needUuid(ctx.params.id, "conversation"), u.id]);
    if (!t) throw notFound("Conversation not found");
    return { ...mapTicket(t), messages: await thread(t.id) };
  });

  r.post("/api/support/:id/messages", async (ctx) => {
    const u = needUser(ctx);
    const id = needUuid(ctx.params.id, "conversation");
    const body = str(ctx.body.message, 2000);
    if (!body) throw bad("Write a message");
    await limit(u.id, "supportMsg", 60, 86400);
    const t = await one("SELECT id FROM support_tickets WHERE id = $1 AND user_id = $2", [id, u.id]);
    if (!t) throw notFound("Conversation not found");
    await q("INSERT INTO support_messages (ticket_id, author_id, body) VALUES ($1, $2, $3)", [id, u.id, body]);
    await q("UPDATE support_tickets SET status = 'open', updated_at = now() WHERE id = $1", [id]);
  });

  if (!admin) return;
  // ---------- LastPick team (admins; moderators see their states) ----------
  const staff = (ctx) => {
    const u = needUser(ctx);
    if (u.role === "admin") return { id: u.id, canSee: () => true };
    if (u.role === "moderator") return { id: u.id, canSee: (s) => !s || (u.regions || []).includes(s) };
    throw denied("Admins only");
  };
  r.get("/api/admin/support", async (ctx) => {
    const me = staff(ctx);
    const status = ["open", "answered", "closed"].includes(ctx.query.status) ? ctx.query.status : "open";
    const rows = await many(`SELECT t.*, ${LAST}, u.name AS u_name, u.email AS u_email, u.phone AS u_phone
      FROM support_tickets t LEFT JOIN users u ON u.id = t.user_id WHERE t.status = $1 ORDER BY t.updated_at DESC LIMIT 200`, [status]);
    return rows.filter((t) => me.canSee(t.state)).map(mapTicket);
  });
  r.get("/api/admin/callbacks", async (ctx) => {
    const me = staff(ctx);
    const status = ctx.query.status === "done" ? "done" : "new";
    const rows = await many(`SELECT c.*, u.name AS u_name, u.email AS u_email, u.phone AS u_phone, b.name AS b_name, b.area AS b_area
      FROM callbacks c LEFT JOIN users u ON u.id = c.user_id LEFT JOIN businesses b ON b.id = c.user_id
      WHERE c.status = $1 ORDER BY c.created_at ${status === "new" ? "ASC" : "DESC"} LIMIT 200`, [status]);
    return rows.filter((c) => me.canSee(c.state)).map(mapCallback);
  });
  r.post("/api/admin/callbacks/:id/done", async (ctx) => {
    const me = staff(ctx);
    const id = needUuid(ctx.params.id, "call back");
    const c = await one("SELECT state FROM callbacks WHERE id = $1", [id]);
    if (!c || !me.canSee(c.state)) throw notFound("Call back not found");
    await q("UPDATE callbacks SET status = 'done', done_at = now(), done_by = $2 WHERE id = $1", [id, me.id]);
    audit("admin_callback_done", me.id, { id });
  });
  r.get("/api/admin/support/:id", async (ctx) => {
    const me = staff(ctx);
    const t = await one(`SELECT t.*, ${LAST}, u.name AS u_name, u.email AS u_email, u.phone AS u_phone
      FROM support_tickets t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = $1`, [needUuid(ctx.params.id, "conversation")]);
    if (!t || !me.canSee(t.state)) throw notFound("Conversation not found");
    return { ...mapTicket(t), messages: await thread(t.id) };
  });
  r.post("/api/admin/support/:id/reply", async (ctx) => {
    const me = staff(ctx);
    const id = needUuid(ctx.params.id, "conversation");
    const t = await one("SELECT state FROM support_tickets WHERE id = $1", [id]);
    if (!t || !me.canSee(t.state)) throw notFound("Conversation not found");
    const body = str(ctx.body.message, 2000);
    if (body) await q("INSERT INTO support_messages (ticket_id, from_staff, author_id, body) VALUES ($1, true, $2, $3)", [id, me.id, body]);
    const status = ctx.body.close ? "closed" : body ? "answered" : null;
    if (!status) throw bad("Write a reply");
    await q("UPDATE support_tickets SET status = $2, updated_at = now() WHERE id = $1", [id, status]);
    audit("admin_support", me.id, { ticket: id, status });
  });
}
