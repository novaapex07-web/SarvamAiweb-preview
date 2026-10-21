/* Sable & Circuit — Admin Studio shared runtime.
   Handles Supabase, theme/preferences, the corner menu, auth guard and
   the unread-message watcher. Page scripts listen for "admin:ready". */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Backend connection.  These are the SAME project and tables the main
   * website uses.  Do not change the URL/key or the table or column
   * names, or the public site and the admin will drift apart.
   * ------------------------------------------------------------------ */
  var SUPABASE_URL = "https://demo-project.supabase.co";
  var SUPABASE_KEY = "demo-publishable-key";
  var COVER_BUCKET = "article-covers";

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  /* ---------------------------- preferences ------------------------- */
  var KEYS = { theme: "sc_theme", accent: "sc_accent", density: "sc_density", motion: "sc_motion" };
  var ACCENTS = {
    teal:    { dark: "#00aebb", light: "#00838f" },
    indigo:  { dark: "#7c8cff", light: "#4f46e5" },
    emerald: { dark: "#34d399", light: "#059669" },
    amber:   { dark: "#f0a132", light: "#b45309" },
    rose:    { dark: "#fb7185", light: "#be123c" }
  };
  var pref = {
    get: function (k, d) { return localStorage.getItem(KEYS[k]) || d; },
    set: function (k, v) { localStorage.setItem(KEYS[k], v); }
  };
  function effectiveTheme() {
    var t = pref.get("theme", "system");
    if (t === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return t;
  }
  function paint() {
    var th = effectiveTheme();
    var root = document.documentElement;
    root.setAttribute("data-theme", th);
    root.setAttribute("data-density", pref.get("density", "comfortable"));
    root.setAttribute("data-motion", pref.get("motion", "full"));
    var a = ACCENTS[pref.get("accent", "teal")] || ACCENTS.teal;
    root.style.setProperty("--accent", th === "dark" ? a.dark : a.light);
    root.style.setProperty("--accent-ink", th === "dark" ? "#04120f" : "#ffffff");
    document.dispatchEvent(new CustomEvent("theme:changed", { detail: { theme: th } }));
  }
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      if (pref.get("theme", "system") === "system") paint();
    });
  } catch (e) { /* older browsers */ }
  paint();

  /* ------------------------------ helpers --------------------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function slugify(s) {
    return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function fmtDate(v) {
    if (!v) return "—";
    var d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function relTime(v) {
    if (!v) return "—";
    var d = new Date(v), diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  }
  function friendly(e) {
    var s = (e && e.message) ? e.message : String(e || "Something went wrong.");
    if (/email rate limit exceeded|over_email_send_rate_limit/i.test(s))
      return "Supabase email rate limit reached (429). No email was sent. Wait for the limit window to reset, or configure custom SMTP under Supabase → Authentication → SMTP Settings.";
    if (/already registered|already exists|user already/i.test(s))
      return "That email already has an account. Use Sign in, or Forgot password.";
    if (/invalid login credentials/i.test(s))
      return "Email and password did not match. Check both, or use Forgot password.";
    if (/email not confirmed/i.test(s))
      return "This email has not been confirmed yet. Check the inbox for the confirmation link.";
    if (/duplicate key|already exists/i.test(s))
      return "A record with that slug or name already exists.";
    if (/row-level security|permission denied|new row violates/i.test(s))
      return "Permission denied by the database. Confirm your admin role and the table's RLS policies.";
    return s;
  }
  function toast(msg, kind, title) {
    var box = $("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; box.className = "toasts"; document.body.appendChild(box); }
    var el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.innerHTML = (title ? "<b>" + esc(title) + "</b>" : "") + esc(msg);
    box.appendChild(el);
    setTimeout(function () {
      el.style.transition = "opacity .4s"; el.style.opacity = "0";
      setTimeout(function () { el.remove(); }, 420);
    }, 4200);
  }
  function setNotice(id, msg, kind) {
    var n = $(id);
    if (!n) return;
    if (!msg) { n.classList.add("hidden"); n.textContent = ""; return; }
    n.className = "notice" + (kind ? " " + kind : "");
    n.textContent = msg;
  }

  /* ------------------------------ icons ----------------------------- */
  var ICON = {
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/></svg>',
    theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  /* ---------------------------- corner menu ------------------------- */
  var NAV = [
    { id: "dashboard", label: "Dashboard", href: "dashboard.html", ic: "▦" },
    { id: "content", label: "Content", href: "content.html", ic: "✎" },
    { id: "inbox", label: "Inbox", href: "inbox.html", ic: "✉" },
    { id: "account", label: "Account", href: "account.html", ic: "☺" }
  ];

  function navLinks(active) {
    return NAV.map(function (n) {
      return '<a class="navlink' + (n.id === active ? " active" : "") + '" href="' + n.href + '">' +
        '<span class="ic">' + n.ic + "</span>" + n.label + "</a>";
    }).join("");
  }

  function buildShell(user, role) {
    var active = document.body.getAttribute("data-page") || "";
    var initial = (user.email || "A").charAt(0);

    var bar = document.createElement("header");
    bar.className = "topbar";
    bar.innerHTML =
      '<div class="topbar-inner">' +
        '<a class="brand" href="dashboard.html">Sable <b>&amp;</b> Circuit</a>' +
        '<nav class="nav">' + navLinks(active) + "</nav>" +
        '<div class="top-actions">' +
          '<button class="iconbtn" id="bell" title="Notifications" aria-label="Notifications">' + ICON.bell +
            '<span class="dot hidden" id="belldot">0</span></button>' +
          '<button class="iconbtn" id="quicktheme" title="Toggle light / dark" aria-label="Toggle theme">' + ICON.theme + "</button>" +
          '<button class="avatar" id="avatarbtn" title="Menu and settings" aria-label="Menu and settings">' + esc(initial) + "</button>" +
          '<button class="iconbtn" id="menubtn" title="Menu and settings" aria-label="Menu and settings">' + ICON.menu + "</button>" +
        "</div>" +
      "</div>";

    var scrim = document.createElement("div");
    scrim.className = "scrim"; scrim.id = "scrim";

    var drawer = document.createElement("aside");
    drawer.className = "drawer"; drawer.id = "drawer"; drawer.setAttribute("aria-hidden", "true");
    var swatches = Object.keys(ACCENTS).map(function (k) {
      return '<button class="swatch" data-accent="' + k + '" title="' + k + '" aria-label="' + k +
        '" style="background:' + ACCENTS[k].dark + '"></button>';
    }).join("");
    drawer.innerHTML =
      '<div class="drawer-head">' +
        "<div><div class=\"drawer-title\">Menu</div>" +
        '<div class="muted small" id="drawerUser">' + esc(user.email || "") + " · " + esc(role || "admin") + "</div></div>" +
        '<button class="iconbtn" id="drawerclose" aria-label="Close menu">' + ICON.close + "</button>" +
      "</div>" +
      '<div class="drawer-body">' +
        '<section class="drawer-sec"><div class="sec-label">Navigate</div>' +
          '<nav class="drawer-nav">' + navLinks(active) + "</nav></section>" +
        '<section class="drawer-sec"><div class="sec-label">Appearance</div>' +
          '<div class="seg" id="themeSeg">' +
            '<button data-theme-opt="light">Light</button>' +
            '<button data-theme-opt="dark">Dark</button>' +
            '<button data-theme-opt="system">System</button>' +
          "</div></section>" +
        '<section class="drawer-sec"><div class="sec-label">Accent</div>' +
          '<div class="swatches" id="accentRow">' + swatches + "</div></section>" +
        '<section class="drawer-sec"><div class="sec-label">Density</div>' +
          '<div class="seg" id="densitySeg">' +
            '<button data-density-opt="comfortable">Comfortable</button>' +
            '<button data-density-opt="compact">Compact</button>' +
          "</div></section>" +
        '<section class="drawer-sec"><div class="sec-label">Motion</div>' +
          '<div class="seg" id="motionSeg">' +
            '<button data-motion-opt="full">Full</button>' +
            '<button data-motion-opt="reduced">Reduced</button>' +
          "</div></section>" +
        '<section class="drawer-sec">' +
          '<button class="btn block" id="drawerAccount">Account &amp; security</button>' +
          '<button class="btn block danger" id="drawerSignout">Sign out</button>' +
        "</section>" +
      "</div>";

    document.body.insertBefore(scrim, document.body.firstChild);
    document.body.insertBefore(drawer, document.body.firstChild);
    document.body.insertBefore(bar, document.body.firstChild);

    /* drawer open / close */
    function openDrawer() { drawer.classList.add("open"); scrim.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); }
    function closeDrawer() { drawer.classList.remove("open"); scrim.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); }
    $("menubtn").onclick = openDrawer;
    $("avatarbtn").onclick = openDrawer;
    $("drawerclose").onclick = closeDrawer;
    scrim.onclick = closeDrawer;
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

    /* theme + preference controls */
    function syncSegs() {
      var th = pref.get("theme", "system"), den = pref.get("density", "comfortable"), mo = pref.get("motion", "full");
      drawer.querySelectorAll("[data-theme-opt]").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-theme-opt") === th); });
      drawer.querySelectorAll("[data-density-opt]").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-density-opt") === den); });
      drawer.querySelectorAll("[data-motion-opt]").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-motion-opt") === mo); });
      drawer.querySelectorAll("[data-accent]").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-accent") === pref.get("accent", "teal")); });
    }
    drawer.querySelectorAll("[data-theme-opt]").forEach(function (b) {
      b.onclick = function () { pref.set("theme", b.getAttribute("data-theme-opt")); paint(); syncSegs(); };
    });
    drawer.querySelectorAll("[data-density-opt]").forEach(function (b) {
      b.onclick = function () { pref.set("density", b.getAttribute("data-density-opt")); paint(); syncSegs(); };
    });
    drawer.querySelectorAll("[data-motion-opt]").forEach(function (b) {
      b.onclick = function () { pref.set("motion", b.getAttribute("data-motion-opt")); paint(); syncSegs(); };
    });
    drawer.querySelectorAll("[data-accent]").forEach(function (b) {
      b.onclick = function () { pref.set("accent", b.getAttribute("data-accent")); paint(); syncSegs(); };
    });
    syncSegs();

    $("quicktheme").onclick = function () {
      var next = effectiveTheme() === "dark" ? "light" : "dark";
      pref.set("theme", next); paint(); syncSegs();
    };
    $("drawerAccount").onclick = function () { location.href = "account.html"; };
    $("drawerSignout").onclick = async function () {
      if (!confirm("Sign out of the admin studio?")) return;
      await sb.auth.signOut();
      location.replace("index.html");
    };
    document.dispatchEvent(new CustomEvent("shell:built"));
  }

  /* --------------------------- notifications ------------------------ *
   * The bell reads the real admin_notifications table. A notification is
   * only ever shown when a row actually exists — nothing is invented here.
   * ------------------------------------------------------------------ */
  function notifIcon(kind) {
    return kind === "article_published" ? "✎" : (kind === "contact_message" ? "✉" : "•");
  }
  function notifHref(n) {
    if (n.kind === "contact_message") return "inbox.html";
    if (n.kind === "article_published") return "content.html";
    return "dashboard.html";
  }
  function startWatcher() {
    var last = null;

    var panel = document.createElement("div");
    panel.className = "notifpanel";
    panel.id = "notifpanel";
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML =
      '<div class="notif-head"><b>Notifications</b>' +
        '<button class="linklike" id="notifread" type="button">Mark all read</button></div>' +
      '<div class="notif-list" id="notiflist"><div class="empty">Loading…</div></div>';
    document.body.appendChild(panel);
    var open = false;

    async function refresh(announce) {
      var res = await sb.from("admin_notifications").select("*", { count: "exact", head: true }).eq("is_read", false);
      if (res.error) return; // never crash the UI over a count
      var n = res.count || 0;
      var dot = $("belldot");
      if (dot) {
        dot.textContent = n > 99 ? "99+" : String(n);
        dot.classList.toggle("hidden", n === 0);
      }
      if (announce && last !== null && n > last) toast("You have a new notification.", "ok", "Notification");
      last = n;
      document.dispatchEvent(new CustomEvent("notify:count", { detail: { unread: n } }));
      if (open) loadList();
    }
    async function loadList() {
      var res = await sb.from("admin_notifications").select("*").order("created_at", { ascending: false }).limit(20);
      var list = $("notiflist");
      if (res.error) { list.innerHTML = '<div class="empty">' + esc(friendly(res.error)) + "</div>"; return; }
      var rows = res.data || [];
      list.innerHTML = rows.length ? rows.map(function (n) {
        return '<a class="notif' + (n.is_read ? "" : " unread") + '" href="' + notifHref(n) + '">' +
          '<span class="ic">' + notifIcon(n.kind) + "</span>" +
          '<span class="body"><b>' + esc(n.title || "Notification") + "</b>" +
          (n.body ? '<span class="muted small">' + esc(n.body) + "</span>" : "") + "</span>" +
          '<span class="when">' + relTime(n.created_at) + "</span></a>";
      }).join("") : '<div class="empty">No notifications yet.</div>';
    }
    function setOpen(v) {
      open = v;
      panel.classList.toggle("open", v);
      panel.setAttribute("aria-hidden", v ? "false" : "true");
      if (v) loadList();
    }
    $("bell").onclick = function (e) { e.stopPropagation(); setOpen(!open); };
    $("notifread").onclick = async function () {
      var r = await sb.from("admin_notifications").update({ is_read: true }).eq("is_read", false);
      if (r.error) { toast(friendly(r.error), "error"); return; }
      await refresh(false); loadList();
    };
    document.addEventListener("click", function (e) {
      if (open && !panel.contains(e.target) && e.target.id !== "bell") setOpen(false);
    });
    // Realtime only fires if the table is published to Realtime; the poll is a fallback.
    try {
      sb.channel("sc-admin-notifications")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_notifications" }, function () { refresh(true); })
        .subscribe();
    } catch (e) { /* realtime optional */ }
    refresh(false);
    setInterval(function () { refresh(true); }, 60000);
    window.Admin.refreshUnread = function () { refresh(false); };
  }

  /* ----------------------------- auth guard ------------------------- */
  async function requireAuth() {
    var s = await sb.auth.getSession();
    var session = s.data && s.data.session;
    if (!session) { location.replace("index.html"); return null; }
    var res = await sb.from("admin_users").select("role").eq("user_id", session.user.id).maybeSingle();
    if (res.error || !res.data) {
      await sb.auth.signOut();
      location.replace("index.html?denied=1");
      return null;
    }
    return { user: session.user, role: res.data.role };
  }

  /* ------------------------------ exports --------------------------- */
  window.Admin = {
    sb: sb,
    COVER_BUCKET: COVER_BUCKET,
    $: $, esc: esc, slugify: slugify, fmtDate: fmtDate, relTime: relTime,
    friendly: friendly, toast: toast, setNotice: setNotice, paint: paint,
    pref: pref, effectiveTheme: effectiveTheme, ICON: ICON,
    requireAuth: requireAuth,
    startWatcher: startWatcher,
    buildShell: buildShell
  };

  /* ---------------------------- boot -------------------------------- */
  (async function boot() {
    if (document.body.getAttribute("data-shell") === "app") {
      var who = await requireAuth();
      if (!who) return;
      buildShell(who.user, who.role);
      startWatcher();
      document.dispatchEvent(new CustomEvent("admin:ready", { detail: who }));
    } else {
      document.dispatchEvent(new CustomEvent("admin:booted"));
    }
    // Any page: bounce to sign-in when the session ends.
    sb.auth.onAuthStateChange(function (event) {
      if (event === "SIGNED_OUT") location.replace("index.html");
    });
  })();
})();
