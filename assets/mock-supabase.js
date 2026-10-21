/* Mock Supabase client for the static preview build.
   Everything lives in memory — no network, no database, no secrets. */
(function () {
  "use strict";

  var now = Date.now();
  function iso(msAgo) { return new Date(now - msAgo).toISOString(); }
  // Resolve on a macrotask so page scripts finish attaching their listeners
  // before the app dispatches its "ready" event (mirrors real network timing).
  function later(v) { return new Promise(function (res) { setTimeout(function () { res(v); }, 6); }); }
  function cover(label, c1, c2) {
    return "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/>' +
      '</linearGradient></defs><rect width="640" height="360" fill="url(#g)"/>' +
      '<text x="34" y="196" fill="#ffffff" font-family="Georgia,serif" font-size="36">' + label + '</text>' +
      '</svg>');
  }

  var DB = {
    admin_users: [{ user_id: "demo-user", role: "owner" }],
    categories: [
      { id: "c1", name: "Technology", slug: "technology", description: "Product, platforms and engineering.", glyph: "✦", sort_order: 10 },
      { id: "c2", name: "Cybersecurity", slug: "cybersecurity", description: "Security, privacy and threat research.", glyph: "⛨", sort_order: 20 },
      { id: "c3", name: "Design", slug: "design", description: "Interface, type and systems.", glyph: "✎", sort_order: 30 }
    ],
    articles: [
      { id: "a1", title: "Designing calm interfaces", slug: "designing-calm-interfaces", category: "Design",
        status: "published", excerpt: "Why fewer moving parts make a product feel faster and steadier.",
        cover_image_url: cover("Calm interfaces", "#0e7c86", "#0b3b4a"),
        content: "Calm software removes decisions the reader never asked to make.\n\nStart by cutting, not by adding. A single clear column, one accent colour and a steady rhythm carry more weight than any animation.\n\nThe result is not minimalism for its own sake — it is respect for attention.",
        created_by: "demo-user", created_at: iso(86400000 * 6), updated_at: iso(3600000 * 4), published_at: iso(3600000 * 4) },
      { id: "a2", title: "A field guide to threat modelling", slug: "field-guide-threat-modelling", category: "Cybersecurity",
        status: "published", excerpt: "A practical way to ask what could go wrong before it does.",
        cover_image_url: cover("Threat modelling", "#4338ca", "#1e1b4b"),
        content: "Threat modelling is a conversation, not a document.\n\nWalk the data path, name the assets, and ask who benefits from breaking each step. Most findings are cheap to fix when they are found early.",
        created_by: "demo-user", created_at: iso(86400000 * 12), updated_at: iso(86400000 * 2), published_at: iso(86400000 * 2) },
      { id: "a3", title: "What we learned shipping weekly", slug: "learned-shipping-weekly", category: "Technology",
        status: "draft", excerpt: "Notes on cadence, small batches and honest retrospectives.",
        cover_image_url: "", content: "Draft in progress…",
        created_by: "demo-user", created_at: iso(86400000 * 3), updated_at: iso(3600000 * 20), published_at: null },
      { id: "a4", title: "Typography for long reads", slug: "typography-for-long-reads", category: "Design",
        status: "draft", excerpt: "Measure, leading and the quiet work of making text easy.",
        cover_image_url: "", content: "Draft in progress…",
        created_by: "demo-user", created_at: iso(86400000 * 1), updated_at: iso(3600000 * 30), published_at: null }
    ],
    contact_messages: [
      { id: "m1", name: "Priya Sharma", email: "priya@example.com", subject: "Partnership enquiry",
        message: "Hello, I run a small research group and would love to contribute a guest piece on privacy engineering. Who should I speak to?",
        status: "new", created_at: iso(3600000 * 3) },
      { id: "m2", name: "Arjun Menon", email: "arjun@example.com", subject: "Broken link",
        message: "The link in your threat-modelling article returns a 404 on mobile. Thought you would want to know.",
        status: "new", created_at: iso(3600000 * 9) },
      { id: "m3", name: "Lena Fischer", email: "lena@example.com", subject: "Thanks",
        message: "Just wanted to say the calm-interfaces piece was the best thing I read this week.",
        status: "read", created_at: iso(86400000 * 2) },
      { id: "m4", name: "Ravi Iyer", email: "ravi@example.com", subject: "Newsletter",
        message: "Do you have a newsletter I can subscribe to?",
        status: "archived", created_at: iso(86400000 * 5) }
    ]
  };

  var SESSION = {
    user: { id: "demo-user", email: "admin@sable-circuit.demo", created_at: iso(86400000 * 30), last_sign_in_at: iso(3600000) },
    expires_at: Math.floor(now / 1000) + 3600,
    token_type: "bearer"
  };

  function isAuthPage() {
    var p = location.pathname;
    if (document.body && document.body.getAttribute("data-page") === "auth") return true;
    return /\/$|index\.html$/.test(p);
  }

  function Builder(table) {
    this.table = table; this.filters = []; this.orders = []; this.lim = null;
    this.op = "select"; this.opts = {}; this.payload = null; this._single = false;
  }
  Builder.prototype.select = function (cols, opts) { this.op = "select"; this.opts = opts || {}; return this; };
  Builder.prototype.eq = function (c, v) { this.filters.push([c, v]); return this; };
  Builder.prototype.order = function (c, o) { this.orders.push([c, o || {}]); return this; };
  Builder.prototype.limit = function (n) { this.lim = n; return this; };
  Builder.prototype.maybeSingle = function () { this._single = true; return this._run(); };
  Builder.prototype.single = function () { this._single = true; return this._run(); };
  Builder.prototype.insert = function (row) { this.op = "insert"; this.payload = row; return this; };
  Builder.prototype.update = function (row) { this.op = "update"; this.payload = row; return this; };
  Builder.prototype.delete = function () { this.op = "delete"; return this; };
  Builder.prototype.then = function (ok, bad) { return this._run().then(ok, bad); };
  Builder.prototype._match = function (r) {
    return this.filters.every(function (f) { return r[f[0]] === f[1]; });
  };
  Builder.prototype._run = function () {
    var self = this;
    return later((function () {
      var rows = DB[self.table] || (DB[self.table] = []);
      if (self.op === "select") {
        var out = rows.filter(function (r) { return self._match(r); });
        if (self.opts.head) return { data: null, count: out.length, error: null };
        out = out.slice();
        self.orders.forEach(function (o) {
          out.sort(function (a, b) {
            var x = a[o[0]], y = b[o[0]];
            var d = x > y ? 1 : (x < y ? -1 : 0);
            return o[1].ascending === false ? -d : d;
          });
        });
        if (self.lim != null) out = out.slice(0, self.lim);
        if (self._single) return { data: out[0] || null, error: null };
        return { data: out, error: null };
      }
      if (self.op === "insert") {
        var row = Object.assign({}, self.payload);
        if (!row.id) row.id = "gen-" + Math.random().toString(36).slice(2, 8);
        rows.push(row);
        return { data: [row], error: null };
      }
      if (self.op === "update") {
        rows.forEach(function (r) { if (self._match(r)) Object.assign(r, self.payload); });
        return { data: null, error: null };
      }
      if (self.op === "delete") {
        DB[self.table] = rows.filter(function (r) { return !self._match(r); });
        return { data: null, error: null };
      }
      return { data: null, error: null };
    })());
  };

  function client() {
    return {
      from: function (t) { return new Builder(t); },
      auth: {
        getSession: function () {
          return later({ data: { session: isAuthPage() ? null : SESSION }, error: null });
        },
        onAuthStateChange: function () {
          return { data: { subscription: { unsubscribe: function () {} } } };
        },
        signOut: function () { return later({ error: null }); },
        signInWithPassword: function () { return later({ data: { user: SESSION.user, session: SESSION }, error: null }); },
        signUp: function () { return later({ data: { user: SESSION.user, session: SESSION }, error: null }); },
        resetPasswordForEmail: function () { return later({ data: {}, error: null }); },
        updateUser: function () { return later({ data: { user: SESSION.user }, error: null }); },
        refreshSession: function () { return later({ data: { session: SESSION }, error: null }); }
      },
      storage: {
        from: function () {
          return {
            upload: function () { return Promise.resolve({ data: { path: "demo" }, error: null }); },
            getPublicUrl: function () { return { data: { publicUrl: cover("Cover", "#0e7c86", "#0b3b4a") } }; }
          };
        }
      },
      channel: function () {
        var o = { on: function () { return o; }, subscribe: function () { return o; } };
        return o;
      }
    };
  }

  window.supabase = { createClient: function () { return client(); } };

  document.addEventListener("DOMContentLoaded", function () {
    var b = document.createElement("div");
    b.textContent = "DEMO PREVIEW · SAMPLE DATA";
    b.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:300;padding:7px 12px;" +
      "border-radius:999px;font:700 10.5px/1 system-ui;letter-spacing:.14em;" +
      "background:#0b1c1a;color:#ffd76a;border:1px solid rgba(255,215,106,.45);opacity:.92";
    document.body.appendChild(b);
  });
})();
