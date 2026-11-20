// Minimal PostgreSQL driver used ONLY by local tests, where the "pg" package can't be installed.
// Production uses the real "pg" package. Supports: trust auth, extended query protocol, text results,
// and the type conversions pg does by default (int8/numeric as strings, timestamps as Date, json, text[]).
import net from "node:net";

const TYPES = {
  16: (v) => v === "t", 20: (v) => v, 21: Number, 23: Number, 26: Number, 700: Number, 701: Number, 1700: (v) => v,
  114: JSON.parse, 3802: JSON.parse, 1184: (v) => new Date(v), 1114: (v) => new Date(v + "Z"),
  1009: parseArray, 1015: parseArray, 1007: (v) => parseArray(v).map(Number), 1016: (v) => parseArray(v),
};
function parseArray(s) {
  if (s === "{}") return [];
  const out = []; let i = 1, cur = "", quoted = false, wasQuoted = false;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === "\\") cur += s[++i];
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') { quoted = true; wasQuoted = true; }
    else if (ch === "," || ch === "}") { out.push(!wasQuoted && cur === "NULL" ? null : cur); cur = ""; wasQuoted = false; }
    else cur += ch;
  }
  return out;
}
function toParam(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return "{" + v.map((x) => (x === null ? "NULL" : '"' + String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"')).join(",") + "}";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

class Conn {
  constructor(opts) { this.opts = opts; this.buf = Buffer.alloc(0); this.waiters = []; this.queue = Promise.resolve(); }
  connect() {
    const url = new URL(this.opts.connectionString || "postgres://postgres@localhost/postgres");
    const host = decodeURIComponent(url.searchParams.get("host") || url.hostname || "localhost");
    const port = Number(url.port || 5432);
    this.sock = host.startsWith("/") ? net.connect(`${host}/.s.PGSQL.${port}`) : net.connect(port, host);
    this.sock.on("data", (d) => { this.buf = Buffer.concat([this.buf, d]); this.pump(); });
    this.sock.on("error", (e) => { this.err = e; this.pump(); });
    const params = { user: decodeURIComponent(url.username || "postgres"), database: url.pathname.slice(1) || "postgres", client_encoding: "UTF8", DateStyle: "ISO" };
    const body = Buffer.concat([Buffer.from([0, 3, 0, 0]), ...Object.entries(params).flatMap(([k, v]) => [Buffer.from(k + "\0"), Buffer.from(v + "\0")]), Buffer.from([0])]);
    const len = Buffer.alloc(4); len.writeInt32BE(body.length + 4);
    this.sock.write(Buffer.concat([len, body]));
    return this.until((m) => m.type === "Z");
  }
  pump() {
    for (;;) {
      if (this.buf.length < 5) break;
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < len + 1) break;
      const msg = { type: String.fromCharCode(this.buf[0]), body: this.buf.subarray(5, len + 1) };
      this.buf = this.buf.subarray(len + 1);
      this.waiters[0]?.on(msg);
    }
    if (this.err) this.waiters.splice(0).forEach((w) => w.reject(this.err));
  }
  until(stop) {
    return new Promise((resolve, reject) => {
      const msgs = [];
      this.waiters.push({ reject, on: (m) => { msgs.push(m); if (stop(m)) { this.waiters.shift(); resolve(msgs); } } });
    });
  }
  msg(type, ...parts) {
    const body = Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))));
    const head = Buffer.alloc(5); head[0] = type.charCodeAt(0); head.writeInt32BE(body.length + 4, 1);
    return Buffer.concat([head, body]);
  }
  query(text, params = []) {
    const run = async () => {
      const i16 = (n) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
      const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
      const vals = params.map(toParam);
      const bind = [Buffer.from("\0\0"), i16(0), i16(vals.length), ...vals.flatMap((v) => (v === null ? [i32(-1)] : [i32(Buffer.byteLength(v)), Buffer.from(v)])), i16(0)];
      const multi = !params.length && /;\s*\S/.test(text);
      if (multi) this.sock.write(this.msg("Q", text + "\0"));
      else this.sock.write(Buffer.concat([this.msg("P", "\0", text + "\0", i16(0)), this.msg("B", ...bind), this.msg("D", "P\0"), this.msg("E", "\0", i32(0)), this.msg("S")]));
      const msgs = await this.until((m) => m.type === "Z");
      const errMsg = msgs.find((m) => m.type === "E");
      if (errMsg) {
        const f = {}; let p = 0; const b = errMsg.body;
        while (b[p]) { const code = String.fromCharCode(b[p]); const end = b.indexOf(0, p + 1); f[code] = b.subarray(p + 1, end).toString(); p = end + 1; }
        const e = new Error(f.M); e.code = f.C; e.detail = f.D; throw e;
      }
      let fields = []; const rows = []; let rowCount = 0;
      for (const m of msgs) {
        if (m.type === "T") {
          fields = []; let p = 2; const n = m.body.readInt16BE(0);
          for (let k = 0; k < n; k++) { const end = m.body.indexOf(0, p); const name = m.body.subarray(p, end).toString(); p = end + 1; const oid = m.body.readInt32BE(p + 6); p += 18; fields.push({ name, oid }); }
        } else if (m.type === "D") {
          const n = m.body.readInt16BE(0); let p = 2; const row = {};
          for (let k = 0; k < n; k++) {
            const len = m.body.readInt32BE(p); p += 4;
            if (len === -1) { row[fields[k].name] = null; continue; }
            const v = m.body.subarray(p, p + len).toString(); p += len;
            const conv = TYPES[fields[k].oid]; row[fields[k].name] = conv ? conv(v) : v;
          }
          rows.push(row);
        } else if (m.type === "C") { const t = m.body.toString().replace(/\0$/, "").split(" "); rowCount = Number(t[t.length - 1]) || 0; }
      }
      return { rows, rowCount, fields };
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
  end() { try { this.sock.write(this.msg("X")); this.sock.end(); } catch { /* closed */ } }
}

export class Pool {
  constructor(opts) { this.opts = opts; this.idle = []; this.all = []; this.max = opts.max || 10; this.waiting = []; }
  async connect() {
    let c = this.idle.pop();
    if (!c) {
      if (this.all.length >= this.max) { await new Promise((r) => this.waiting.push(r)); return this.connect(); }
      c = new Conn(this.opts); this.all.push(c); await c.connect();
    }
    return { query: (t, p) => c.query(t, p), release: () => { this.idle.push(c); this.waiting.shift()?.(); } };
  }
  async query(text, params) { const c = await this.connect(); try { return await c.query(text, params); } finally { c.release(); } }
  on() {}
  async end() { this.all.forEach((c) => c.end()); }
}
