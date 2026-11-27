// Customer and partner support: ask for help in the app, the LastPick team answers in the same conversation.
// (Formal complaints with legal deadlines stay in /api/grievances.)
import { needUser } from "../auth.js";
import { MAIL_REPLY_TO, SERVICE } from "../config.js";
import { mailProvider, sendEmail } from "../mail.js";
import { log } from "../log.js";
import { many, one, q, tx } from "../db.js";
import { limit } from "../ratelimit.js";
import { audit } from "../shared.js";
import { bad, cityKey, denied, isDataImage, ms, needUuid, notFound, precondition, str } from "../util.js";
import { deleteFile, fileUrl, newKey, saveFile } from "../storage.js";

// Help topics (each has an instant answer in the app, web/src/lib/helptopics.js). Older topic names stay valid.
export const SUPPORT_TOPICS = [
  "Offer not honoured by the shop", "Shop not answering calls", "Login or code problem", "Payment or plan",
  "Business verification", "Location is wrong", "App not working", "Rentals listing", "Posting offers", "A customer or lead",
  "Safety concern", "Something else",
  "Using the app", "Login or account", "An offer or business", "Plans and payments",
];
const MAX_TICKET_PHOTOS = 3, TICKET_PHOTO_CHARS = 500_000; // the app shrinks each photo to ~250 KB first
async function savePhotos(ticketId, list) {
  const photos = (Array.isArray(list) ? list : []).slice(0, MAX_TICKET_PHOTOS);
  const keys = [];
  for (const p of photos) {
    if (!isDataImage(p, TICKET_PHOTO_CHARS)) throw bad("Each photo must be a JPEG or PNG under 1 MB");
    keys.push(await saveFile(`tickets/${ticketId}/${newKey("photo")}`, p));
  }
  return keys;
}
const ticketNo = (n) => (n ? `LP-${n}` : "");
export const CALLBACK_TOPICS = { customer: ["An offer or shop", "Plans and payments", "My account", "Something else"], partner: ["Plans and payments", "Business verification", "Posting offers", "Something else"] };
export const CALLBACK_TIMES = ["Morning", "Afternoon", "Evening"];
const mapCallback = (c) => ({
  id: c.id, role: c.role, topic: c.topic, bestTime: c.best_time, note: c.note, status: c.status, createdAt: ms(c.created_at), doneAt: ms(c.done_at),
  user: c.u_email !== undefined ? { name: c.u_name || "", email: c.u_email || "", phone: c.u_phone || "", business: c.b_name || "", area: c.b_area || "" } : undefined,
});
const mapTicket = (t) => ({
  id: t.id, number: ticketNo(t.number), topic: t.topic, status: t.status, role: t.role, createdAt: ms(t.created_at), updatedAt: ms(t.updated_at),
  area: { state: t.state || "", city: t.city || "", pincode: t.pincode || "" }, resolvedBy: t.resolved_by || null, resolvedNote: t.resolved_note || "",
  resolvedAt: ms(t.resolved_at), escalated: !!t.escalated, lastCustomerAt: ms(t.last_customer_at),
  lastMessage: t.last_body || "", lastFromStaff: !!t.last_staff,
  user: t.u_email !== undefined ? { name: t.u_name || "", email: t.u_email || "", phone: t.u_phone || "" } : undefined,
});
const LAST = `(SELECT body FROM support_messages m WHERE m.ticket_id = t.id ORDER BY id DESC LIMIT 1) AS last_body,
              (SELECT from_staff FROM support_messages m WHERE m.ticket_id = t.id ORDER BY id DESC LIMIT 1) AS last_staff`;

async function thread(id) {
  const msgs = await many(`SELECT m.from_staff, m.body, m.photos, m.created_at, a.name AS a_name FROM support_messages m
                           LEFT JOIN users a ON a.id = m.author_id WHERE m.ticket_id = $1 ORDER BY m.id`, [id]);
  const out = [];
  for (const m of msgs) {
    const photos = [];
    for (const k of m.photos || []) photos.push(await fileUrl(k, 3 * 3600));
    out.push({ fromStaff: m.from_staff, by: m.from_staff ? (m.a_name || "LastPick support").split(" ")[0] : "", body: m.body, photos: photos.filter(Boolean), at: ms(m.created_at) });
  }
  return out;
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
    // the area decides which in-charge sees it: the partner's shop, else where the customer is now
    const pl = ctx.body.place || {};
    const t = await tx(async (c) => {
      const biz = (await c.query("SELECT state, city, pincode FROM businesses WHERE id = $1", [u.id])).rows[0];
      const state = biz?.state || str(pl.state, 60), city = biz?.city || str(pl.city, 80), pincode = biz?.pincode || String(pl.pincode || "").replace(/\D/g, "").slice(0, 6);
      return (await c.query("INSERT INTO support_tickets (user_id, role, topic, state, city, pincode, last_customer_at) VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING id, number",
        [u.id, role, topic, state, city, pincode])).rows[0];
    });
    const photos = await savePhotos(t.id, ctx.body.photos);
    await q("INSERT INTO support_messages (ticket_id, author_id, body, photos) VALUES ($1, $2, $3, $4)", [t.id, u.id, body, photos]);
    audit("support_ticket", u.id, { ticket: t.id, topic });
    return { id: t.id, number: ticketNo(t.number) };
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
    const photos = await savePhotos(id, ctx.body.photos);
    await q("INSERT INTO support_messages (ticket_id, author_id, body, photos) VALUES ($1, $2, $3, $4)", [id, u.id, body, photos]);
    await q("UPDATE support_tickets SET status = 'open', resolved_by = NULL, resolved_at = NULL, last_customer_at = now(), updated_at = now() WHERE id = $1", [id]);
  });

  // "My problem is solved"
  r.post("/api/support/:id/resolve", async (ctx) => {
    const u = needUser(ctx);
    const id = needUuid(ctx.params.id, "conversation");
    const t = await one("UPDATE support_tickets SET status = 'closed', resolved_by = 'customer', resolved_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING id", [id, u.id]);
    if (!t) throw notFound("Conversation not found");
    audit("support_resolved", u.id, { ticket: id, by: "customer" });
    return { resolved: true };
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

  // ---------- Support Desk (support.lastpick.in): admins see all; area in-charges ("support") and area agents
  // ("moderator") see only tickets from their states, narrowed to their cities and/or pincodes when set ----------
  const desk = (ctx) => {
    const u = needUser(ctx);
    if (u.role === "admin") return { id: u.id, role: "admin", name: u.name, canSee: () => true, areas: null };
    if (u.role === "support" || u.role === "moderator") {
      const regions = u.regions || [], cities = u.area_cities || [], pins = u.area_pincodes || [];
      const canSee = (t) => regions.includes(t.state) && (!cities.length || t.city == null || cities.includes(cityKey(t.city || ""))) && (!pins.length || t.pincode == null || pins.includes(String(t.pincode || "")));
      return { id: u.id, role: u.role, name: u.name, canSee, areas: { states: regions, cities, pincodes: pins } };
    }
    throw denied("This is for the LastPick support team");
  };
  // business days (Mon–Fri, India time) since a moment; customers are told "within 1–5 business days"
  const businessDays = (from) => {
    if (!from) return 0;
    let n = 0; const d = new Date(new Date(from).getTime() + 5.5 * 3600000); const end = new Date(Date.now() + 5.5 * 3600000);
    d.setUTCHours(0, 0, 0, 0);
    while (d < end) { d.setUTCDate(d.getUTCDate() + 1); if (d <= end && d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n++; }
    return n;
  };
  const OVERDUE_DAYS = 4; // flagged red one day before the 5-business-day promise
  const deskRow = (t) => ({ ...mapTicket(t), waitingDays: t.status === "open" ? businessDays(t.last_customer_at || t.created_at) : 0,
    overdue: t.status === "open" && businessDays(t.last_customer_at || t.created_at) >= OVERDUE_DAYS,
    business: t.b_name || "" });

  r.get("/api/desk/me", async (ctx) => { const me = desk(ctx); return { name: me.name, role: me.role, areas: me.areas }; });

  r.get("/api/desk/tickets", async (ctx) => {
    const me = desk(ctx);
    const view = ["open", "waiting", "overdue", "resolved", "all"].includes(ctx.query.view) ? ctx.query.view : "open";
    const rows = await many(`SELECT t.*, ${LAST}, u.name AS u_name, u.email AS u_email, u.phone AS u_phone, b.name AS b_name
      FROM support_tickets t LEFT JOIN users u ON u.id = t.user_id LEFT JOIN businesses b ON b.id = t.user_id
      WHERE t.created_at > now() - interval '180 days' ORDER BY t.updated_at DESC LIMIT 2000`);
    const mine = rows.filter((t) => me.canSee(t)).map(deskRow);
    const counts = { open: 0, waiting: 0, overdue: 0, resolved: 0, all: mine.length };
    for (const t of mine) { if (t.status === "open") counts.open++; if (t.status === "answered") counts.waiting++; if (t.overdue) counts.overdue++; if (t.status === "closed") counts.resolved++; }
    let list = mine.filter((t) => view === "all" || (view === "open" && t.status === "open") || (view === "waiting" && t.status === "answered")
      || (view === "overdue" && t.overdue) || (view === "resolved" && t.status === "closed"));
    const area = str(ctx.query.area, 80).toLowerCase(), topic = str(ctx.query.topic, 80), text = str(ctx.query.q, 80).toLowerCase().replace(/^#/, "");
    if (area) list = list.filter((t) => [t.area.city, t.area.pincode, t.area.state].some((x) => (x || "").toLowerCase() === area));
    if (topic) list = list.filter((t) => t.topic === topic);
    if (text) list = list.filter((t) => [t.number, t.user?.name, t.user?.email, t.user?.phone, t.business].some((x) => (x || "").toLowerCase().includes(text)));
    // oldest waiting first for open work; newest first otherwise
    if (view === "open" || view === "overdue") list.sort((a, b) => (a.lastCustomerAt || a.createdAt) - (b.lastCustomerAt || b.createdAt));
    return { counts, tickets: list.slice(0, 300) };
  });

  r.get("/api/desk/tickets/:id", async (ctx) => {
    const me = desk(ctx);
    const t = await one(`SELECT t.*, ${LAST}, u.name AS u_name, u.email AS u_email, u.phone AS u_phone, b.name AS b_name
      FROM support_tickets t LEFT JOIN users u ON u.id = t.user_id LEFT JOIN businesses b ON b.id = t.user_id WHERE t.id = $1`, [needUuid(ctx.params.id, "ticket")]);
    if (!t || !me.canSee(t)) throw notFound("Ticket not found");
    audit("desk_view", me.id, { ticket: t.id });
    return { ...deskRow(t), messages: await thread(t.id) };
  });

  const deskTicket = async (ctx) => {
    const me = desk(ctx);
    const id = needUuid(ctx.params.id, "ticket");
    const t = await one("SELECT * FROM support_tickets WHERE id = $1", [id]);
    if (!t || !me.canSee(t)) throw notFound("Ticket not found");
    return { me, t };
  };

  r.post("/api/desk/tickets/:id/reply", async (ctx) => {
    const { me, t } = await deskTicket(ctx);
    const body = str(ctx.body.message, 2000);
    if (!body) throw bad("Write a reply");
    const photos = await savePhotos(t.id, ctx.body.photos);
    await q("INSERT INTO support_messages (ticket_id, from_staff, author_id, body, photos) VALUES ($1, true, $2, $3, $4)", [t.id, me.id, body, photos]);
    await q("UPDATE support_tickets SET status = 'answered', first_reply_at = COALESCE(first_reply_at, now()), updated_at = now() WHERE id = $1", [t.id]);
    audit("desk_reply", me.id, { ticket: t.id });
    return { ok: true };
  });

  // resolved: on a call (a short note is required) or by the team
  r.post("/api/desk/tickets/:id/resolve", async (ctx) => {
    const { me, t } = await deskTicket(ctx);
    const call = ctx.body.call === true;
    const note = str(ctx.body.note, 300);
    if (call && note.length < 3) throw bad("Add a short note about the call, e.g. \"Called 27 Nov 11 AM, shop agreed\"");
    if (note) await q("INSERT INTO support_messages (ticket_id, from_staff, author_id, body) VALUES ($1, true, $2, $3)", [t.id, me.id, call ? `Resolved on a call: ${note}` : note]);
    await q("UPDATE support_tickets SET status = 'closed', resolved_by = $2, resolved_note = $3, resolved_at = now(), first_reply_at = COALESCE(first_reply_at, now()), updated_at = now() WHERE id = $1",
      [t.id, call ? "call" : "staff", note]);
    audit("desk_resolve", me.id, { ticket: t.id, call });
    return { ok: true };
  });

  r.post("/api/desk/tickets/:id/escalate", async (ctx) => {
    const { me, t } = await deskTicket(ctx);
    await q("UPDATE support_tickets SET escalated = true, updated_at = now() WHERE id = $1", [t.id]);
    audit("desk_escalate", me.id, { ticket: t.id });
    return { ok: true };
  });

  // call-back requests (moved here from the admin panel)
  r.get("/api/desk/callbacks", async (ctx) => {
    const me = desk(ctx);
    const status = ctx.query.status === "done" ? "done" : "new";
    const rows = await many(`SELECT c.*, u.name AS u_name, u.email AS u_email, u.phone AS u_phone, b.name AS b_name, b.area AS b_area, b.city AS b_city, b.pincode AS b_pin
      FROM callbacks c LEFT JOIN users u ON u.id = c.user_id LEFT JOIN businesses b ON b.id = c.user_id
      WHERE c.status = $1 ORDER BY c.created_at ${status === "new" ? "ASC" : "DESC"} LIMIT 300`, [status]);
    return rows.filter((c) => me.canSee({ state: c.state, city: c.b_city ?? null, pincode: c.b_pin ?? null })).map(mapCallback);
  });
  r.post("/api/desk/callbacks/:id/done", async (ctx) => {
    const me = desk(ctx);
    const id = needUuid(ctx.params.id, "call back");
    const c = await one("SELECT c.state, b.city, b.pincode FROM callbacks c LEFT JOIN businesses b ON b.id = c.user_id WHERE c.id = $1", [id]);
    if (!c || !me.canSee({ state: c.state, city: c.city ?? null, pincode: c.pincode ?? null })) throw notFound("Call back not found");
    await q("UPDATE callbacks SET status = 'done', done_at = now(), done_by = $2 WHERE id = $1", [id, me.id]);
    audit("desk_callback_done", me.id, { id });
    return { ok: true };
  });

  // super admins: the in-charges and their workload
  r.get("/api/desk/incharges", async (ctx) => {
    const me = desk(ctx);
    if (me.role !== "admin") throw denied("Super admins only");
    const people = await many("SELECT id, name, email, phone, role, regions, area_cities, area_pincodes FROM users WHERE role IN ('support', 'moderator') ORDER BY name");
    const open = await many("SELECT state, city, pincode, last_customer_at, created_at, first_reply_at FROM support_tickets WHERE status = 'open'");
    const replied = await many(`SELECT t.state, t.city, t.pincode, extract(epoch FROM (t.first_reply_at - t.created_at)) / 86400 AS days
                                FROM support_tickets t WHERE t.first_reply_at > now() - interval '60 days'`);
    return people.map((p) => {
      const regions = p.regions || [], cities = p.area_cities || [], pins = p.area_pincodes || [];
      const sees = (t) => regions.includes(t.state) && (!cities.length || cities.includes(cityKey(t.city || ""))) && (!pins.length || pins.includes(String(t.pincode || "")));
      const mineOpen = open.filter(sees), mineReplied = replied.filter(sees);
      return { id: p.id, name: p.name, email: p.email, phone: p.phone, role: p.role, states: regions, cities, pincodes: pins,
        open: mineOpen.length, overdue: mineOpen.filter((t) => businessDays(t.last_customer_at || t.created_at) >= OVERDUE_DAYS).length,
        avgReplyDays: mineReplied.length ? Math.round((mineReplied.reduce((a, t) => a + Number(t.days), 0) / mineReplied.length) * 10) / 10 : null };
    });
  });
}
