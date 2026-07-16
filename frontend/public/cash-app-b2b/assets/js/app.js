/* ============================================================================
   Neoflo · B2B Cash Application — SPA router + screen views
   Pure vanilla JS. Hash routing (#/dashboard, #/workspace, …). No build step.
   ========================================================================== */
(function () {
  "use strict";
  const D = window.DATA;
  const $ = (sel, root = document) => root.querySelector(sel);
  const content = $("#content");
  const topbar = $("#topbar");

  // ── Org context (entity drives currency; bank chosen in the left nav) ──────
  let selectedEntityId = D.entities[0].id;
  let selectedBankId = D.banks[0].id;
  const currentEntity = () => D.entities.find((e) => e.id === selectedEntityId) || D.entities[0];
  const banksForEntity = () => D.banks.filter((b) => b.entity === selectedEntityId);

  // ── Icons (inline SVG, currentColor) ─────────────────────────────────────
  const icon = (name) => {
    const p = {
      dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/>',
      workspace: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
      unapplied: '<path d="M12 1v22M5 8h9a3 3 0 0 1 0 6H7"/>',
      deductions: '<path d="M4 7h16M4 12h10M4 17h7"/><circle cx="18" cy="16" r="3"/>',
      customers: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6"/>',
      reports: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
      reporting: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
      forecast: '<path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v5h-5"/>',
      cashapp: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
      freight: '<rect x="1" y="6" width="13" height="10" rx="1"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="6" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>',
      ask: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01"/>',
      vendor: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
      driver: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/>',
      finance: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    }[name] || "";
    return `<svg class="navlink__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  };

  // ── Routes (the functional Cash Application sub-pages) ─────────────────────
  const routes = [
    { id: "dashboard",  label: "Dashboard",   render: viewDashboard },
    { id: "workspace",  label: "Apply cash",  render: viewWorkspace },
    { id: "applied",    label: "Posted Collections", render: viewAutoApplied },
    { id: "customers",  label: "Customers 360", render: viewCustomers },
  ];
  function buildNav() {
    const nav = $("#sidebar-nav");
    const subs = routes.map((r) =>
      `<button class="navsub" data-route="${r.id}" title="${r.label}"><span class="navsub__dot"></span><span>${r.label}</span></button>`).join("");
    nav.innerHTML = `
      <div class="navgroup" id="navgroup-cashapp">
        <button class="navlink navlink--group is-open" id="cashapp-toggle">
          ${icon("cashapp")}<span>Cash Application - B2B</span>
          <svg class="navlink__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="navsubs" id="cashapp-subs">${subs}</div>
      </div>`;
    nav.querySelectorAll(".navsub").forEach((a) => { a.onclick = () => { location.hash = "#/" + a.dataset.route; }; });
    const grp = nav.querySelector("#cashapp-toggle");
    grp.onclick = () => { nav.querySelector("#navgroup-cashapp").classList.toggle("collapsed"); grp.classList.toggle("is-open"); };
  }
  function setActiveNav(id) {
    document.querySelectorAll(".navsub").forEach((a) => a.classList.toggle("is-active", a.dataset.route === id));
  }

  // ── Topbar helper ───────────────────────────────────────────────────────
  function setTopbar(title, subtitle, metaHtml = "", actionsHtml = "") {
    topbar.innerHTML = `
      <div class="topbar__titles">
        <div class="topbar__title">${title}</div>
        ${subtitle ? `<div class="topbar__subtitle">${subtitle}</div>` : ""}
      </div>
      <div class="topbar__spacer"></div>
      <div class="topbar__meta">${metaHtml}${actionsHtml}</div>`;
  }

  // ── small render helpers ──────────────────────────────────────────────────
  const fmt = D.fmt;
  const pill = (text, tone) => `<span class="pill pill--${tone}">${text}</span>`;
  function escapeAttr(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function initialsOf(name) { return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase(); }
  function emptyState(title, hint) {
    return `<div class="empty-state"><div class="empty-state__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M3 12l9 4 9-4"/></svg></div><div class="empty-state__title">${title}</div>${hint ? `<div class="empty-state__hint">${hint}</div>` : ""}</div>`;
  }
  function svgLine(vals, stroke) {
    const w = 480, h = 150, pad = 12;
    const max = Math.max(...vals), min = Math.min(...vals);
    const pts = vals.map((v, i) => [pad + i * (w - 2 * pad) / (vals.length - 1), h - pad - ((v - min) / ((max - min) || 1)) * (h - 2 * pad)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = `M${pad} ${h - pad} ` + pts.map((p) => "L" + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + ` L${w - pad} ${h - pad} Z`;
    const dots = pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${stroke}"/>`).join("");
    return `<svg viewBox="0 0 ${w} ${h}" class="svgchart" preserveAspectRatio="none"><path d="${area}" fill="${stroke}" opacity="0.08"/><path d="${line}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round"/>${dots}</svg>`;
  }
  function svgMultiLine(series, labels) {
    const w = 900, h = 240, padL = 34, padR = 10, padT = 14, padB = 26;
    const all = series.flatMap((s) => s.vals); const max = Math.ceil(Math.max(...all) / 5) * 5, min = Math.floor(Math.min(...all) / 5) * 5;
    const n = labels.length;
    const X = (i) => padL + (n === 1 ? 0 : i * (w - padL - padR) / (n - 1));
    const Y = (v) => h - padB - ((v - min) / ((max - min) || 1)) * (h - padT - padB);
    const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => { const v = Math.round(min + t * (max - min)); const y = Y(v).toFixed(1); return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#e7e6e3" stroke-width="1"/><text x="${padL - 6}" y="${(+y + 3)}" font-size="10" fill="#848076" text-anchor="end">${v}%</text>`; }).join("");
    const paths = series.map((s) => {
      const line = s.vals.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
      const dots = s.vals.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3" fill="${s.color}"/>`).join("");
      return `<path d="${line}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"/>${dots}`;
    }).join("");
    const xl = labels.map((l, i) => `<text x="${X(i).toFixed(1)}" y="${h - 8}" font-size="10" fill="#848076" text-anchor="middle">${l}</text>`).join("");
    return `<svg viewBox="0 0 ${w} ${h}" class="svgchart svgchart--tall" preserveAspectRatio="xMidYMid meet">${grid}${paths}${xl}</svg>`;
  }
  const MONTHS12 = ["Jul'25", "Aug'25", "Sep'25", "Oct'25", "Nov'25", "Dec'25", "Jan'26", "Feb'26", "Mar'26", "Apr'26", "May'26", "Jun'26"];
  let dashTf = 12; // trend timeframe in months
  // Neoflo AI mark — a four-point sparkle used wherever the model makes a suggestion.
  const aiSparkSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 5.6a4 4 0 0 0 2.5 2.5L22 12l-5.6 1.9a4 4 0 0 0-2.5 2.5L12 22l-1.9-5.6a4 4 0 0 0-2.5-2.5L2 12l5.6-1.9a4 4 0 0 0 2.5-2.5L12 2z"/></svg>`;
  const uploadIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg>`;

  // ════════════════════════════════════════════════════════════════════════
  //  DASHBOARD
  // ════════════════════════════════════════════════════════════════════════
  let dashSort = { key: "ageDays", dir: -1 };
  function viewDashboard() {
    const db = D.dashboardFor(selectedEntityId);
    const ccy = db.ccy;
    // Recompute the open aggregates from the non-posted credits so posting a credit in
    // Apply cash decrements the dashboard (Open exceptions, Unapplied cash, ageing, types, queue).
    const openList = db.list.filter((x) => !postedIds.has(postedKey(x.id)));
    const ageBucketOf = (d) => d <= 15 ? "0–15 days" : d <= 30 ? "15–30 days" : d <= 90 ? "1–3 months" : d <= 180 ? "3–6 months" : "6 months+";
    const AGE_ORDER = ["0–15 days", "15–30 days", "1–3 months", "3–6 months", "6 months+"];
    const ageing = AGE_ORDER.map((lbl) => { const s = openList.filter((x) => ageBucketOf(x.ageDays) === lbl); return { label: lbl, amount: s.reduce((a, x) => a + x.amount, 0), count: s.length }; });
    const byType = db.byType.map((bt) => { const s = openList.filter((x) => x.reason === bt.label); return { label: bt.label, tone: bt.tone, count: s.length, amount: s.reduce((a, x) => a + x.amount, 0) }; });
    const totalUnapplied = openList.reduce((s, x) => s + x.amount, 0);
    const over30 = openList.filter((x) => x.ageDays > 30).reduce((s, x) => s + x.amount, 0);
    const count = openList.length;
    setTopbar("Cash Application Dashboard", "Daily health — applied, identified, unapplied, exceptions",
      `<label class="topbar__chip topbar__chip--select"><span>Entity</span>
         <select id="entity-select" aria-label="Select entity">
           ${D.entities.map((e) => `<option value="${e.id}" ${e.id === selectedEntityId ? "selected" : ""}>${e.name}</option>`).join("")}
         </select>
       </label>
       <span class="topbar__chip"><span>Processed till</span> <b id="period-chip">${D.lastStatementDate}</b></span>
       <span class="topbar__chip"><span>Currency</span> <b id="currency-chip">${ccy}</b></span>
       ${bankSelectChip()}`,
      uploadStmtAction());

    const kpis = db.kpis.map((k) => {
      let value = k.value, sub = k.sub, exact = k.exact;
      if (k.key === "unapplied") { value = D.fmtCompact(totalUnapplied, ccy); exact = fmt(totalUnapplied, ccy); sub = `${count} on-account · ${D.fmtCompact(over30, ccy)} aged > 30d`; }
      else if (k.key === "exceptions") { value = String(count); exact = count + " exceptions"; }
      return `
      <div class="kpi kpi--${k.tone} kpi--accent-${k.accent || "primary"} ${k.drill ? "kpi--clickable" : ""}" ${k.drill ? `data-drill="${k.drill}"` : ""}>
        <div class="kpi__top">
          <div class="kpi__label">${k.label}</div>
          ${k.info ? `<button class="info-btn" data-info="${escapeAttr(k.info)}" aria-label="What is this metric?">i</button>` : ""}
        </div>
        <div class="kpi__value" ${exact ? `title="${escapeAttr(exact)}"` : ""}>${value} <span class="kpi__trend ${k.deltaTone === "up" ? "up" : "down"}">${k.delta}</span></div>
        <div class="kpi__sub">${sub || ""}</div>
        ${k.drill ? `<div class="kpi__drill">View breakdown →</div>` : ""}
      </div>`; }).join("");

    const maxAge = Math.max(...ageing.map((b) => b.amount), 1);
    const ageBars = ageing.map((b) => `
      <div class="hbar">
        <span>${b.label}</span>
        <div class="hbar__track"><div class="hbar__fill hbar__fill--age" style="width:${maxAge ? (b.amount / maxAge) * 100 : 0}%"></div></div>
        <span class="hbar__val">${D.fmtCompact(b.amount, ccy)}</span>
      </div>`).join("");

    // exceptions by type: count + amount (both shown)
    const maxEx = Math.max(...byType.map((e) => e.count), 1);
    const hbars = byType.map((e) => `
      <div class="hbar hbar--ex">
        <span>${e.label}</span>
        <div class="hbar__track"><div class="hbar__fill" style="width:${maxEx ? (e.count / maxEx) * 100 : 0}%"></div></div>
        <span class="hbar__val">${e.count} · ${D.fmtCompact(e.amount, ccy)}</span>
      </div>`).join("");

    // Aged unapplied — bank-statement style, full list (scrollable, sortable)
    const sortArrow = (k) => dashSort.key === k ? (dashSort.dir < 0 ? " ▾" : " ▴") : "";
    const sorted = openList.slice().sort((a, b) => {
      const av = dashSort.key === "date" ? a.date : dashSort.key === "amount" ? a.amount : a.ageDays;
      const bv = dashSort.key === "date" ? b.date : dashSort.key === "amount" ? b.amount : b.ageDays;
      return (av < bv ? -1 : av > bv ? 1 : 0) * dashSort.dir;
    });
    const queue = sorted.map((u) => `
      <tr>
        <td class="muted" style="white-space:nowrap">${u.date}</td>
        <td><div class="cell-main" style="font-weight:var(--font-weight-medium)">${u.desc}</div><div class="cell-sub">${u.customer} · ${u.id}</div></td>
        <td class="num strong">${fmt(u.amount, ccy)}</td>
        <td>${pill(u.ageDays + "d", u.tone)}</td>
        <td>${pill(u.reason, u.tone)}</td>
      </tr>`).join("");

    // merged auto-apply + customer-identification trend (timeframe selectable)
    const endAA = parseInt(db.kpis[0].value), endID = parseInt(db.kpis[1].value);
    const genSeries = (end, span) => MONTHS12.map((_, i) => Math.min(99, Math.max(50, Math.round(end - span + span * (i / 11) + (((i * 7 + db.count) % 5) - 2)))));
    const aaS = genSeries(endAA, 14), idS = genSeries(endID, 9), keep = dashTf;
    const trendChart = svgMultiLine(
      [{ vals: aaS.slice(12 - keep), color: "var(--surface-success-default)" }, { vals: idS.slice(12 - keep), color: "var(--surface-primary-default)" }],
      MONTHS12.slice(12 - keep));

    content.innerHTML = `
      <div class="section">
        <div class="kpis">${kpis}</div>
      </div>

      <div class="section">
        <div class="card">
          <div class="card__head"><div class="card__title">Auto-apply rate &amp; customer identification — trend</div>
            <div class="seg" id="tf-seg">${[3, 6, 12].map((m) => `<button class="seg__btn ${dashTf === m ? "on" : ""}" data-tf="${m}">${m}m</button>`).join("")}</div>
          </div>
          <div class="card__body">
            <div class="legend" style="margin-bottom:6px">
              <span><i style="background:var(--surface-success-default)"></i> Auto-apply rate</span>
              <span><i style="background:var(--surface-primary-default)"></i> Customer identification</span>
            </div>
            ${trendChart}
          </div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns: 1fr 1fr; align-items:start">
        <div class="card">
          <div class="card__head"><div class="card__title">Unapplied cash ageing — ${D.fmtCompact(totalUnapplied, ccy)}</div></div>
          <div class="card__body"><div class="hbars hbars--age">${ageBars}</div></div>
        </div>
        <div class="card">
          <div class="card__head"><div class="card__title">Exceptions by type</div><span class="muted" style="font-size:12px">${count} total · count · amount</span></div>
          <div class="card__body"><div class="hbars">${hbars}</div></div>
        </div>
      </div>

      <div class="section" style="margin-top:var(--scale-300)">
        <div class="card">
          <div class="card__head"><div class="card__title">Bank statement — aged unapplied credits (oldest first)</div><span class="muted" style="font-size:12px">${count} line items</span></div>
          <div class="card__body card__body--flush"><div class="table-wrap table-scroll"><table class="tbl tbl--fixed">
            <colgroup><col style="width:12%"><col style="width:40%"><col style="width:16%"><col style="width:12%"><col style="width:20%"></colgroup>
            <thead><tr><th class="sortable" data-sort="date">Date${sortArrow("date")}</th><th>Description</th><th class="num sortable" data-sort="amount">Amount${sortArrow("amount")}</th><th class="sortable" data-sort="ageDays">Age${sortArrow("ageDays")}</th><th>Reason / exception type</th></tr></thead>
            <tbody>${queue}</tbody>
          </table></div></div>
        </div>
      </div>`;

    const entSel = $("#entity-select");
    if (entSel) entSel.onchange = () => {
      selectedEntityId = entSel.value;
      const first = banksForEntity()[0]; if (first) selectedBankId = first.id;
      syncSidebarContext();
      viewDashboard();                 // re-render so ALL data + currency follow the entity

      toast(`Entity → ${currentEntity().name} · ${currentEntity().currency}`);
    };
    wireBankBar();

    content.querySelectorAll(".kpi--clickable").forEach((tile) => {
      tile.onclick = (e) => { if (e.target.closest(".info-btn")) return; openBreakdown(tile.dataset.drill); };
    });
    content.querySelectorAll(".info-btn").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); showInfo(b, b.dataset.info); };
    });
    content.querySelectorAll("th.sortable").forEach((th) => {
      th.onclick = () => {
        const k = th.dataset.sort;
        if (dashSort.key === k) dashSort.dir *= -1; else { dashSort.key = k; dashSort.dir = -1; }
        viewDashboard();
      };
    });
    content.querySelectorAll("#tf-seg .seg__btn").forEach((b) => {
      b.onclick = () => { dashTf = +b.dataset.tf; viewDashboard(); };
    });
  }

  // ── KPI breakdown modal (derived from the same entity data, always ties) ──
  function openBreakdown(key) {
    const db = D.dashboardFor(selectedEntityId), ccy = db.ccy;
    const open = db.list.filter((x) => !postedIds.has(postedKey(x.id)));   // exclude posted credits
    const total = open.reduce((s, x) => s + x.amount, 0);
    if (key === "unapplied") {
      const rows = open.slice().sort((a, b) => b.ageDays - a.ageDays).map((u) => `
        <tr><td class="muted" style="white-space:nowrap">${u.date}</td><td class="cell-main">${u.desc}</td><td class="muted">${u.customer}</td><td class="num strong">${fmt(u.amount, ccy)}</td></tr>`).join("");
      openModal("Unapplied cash — line by line", `
        <div class="modal-sub">All ${open.length} unapplied lines from the bank statement. Total ties to the tile: <b>${D.fmtCompact(total, ccy)}</b> (${fmt(total, ccy)}).</div>
        <div class="table-wrap table-scroll"><table class="tbl">
          <thead><tr><th>Value date</th><th>Description</th><th>Customer</th><th class="num">Amount</th></tr></thead>
          <tbody>${rows}<tr class="modal-total"><td colspan="3" class="num">Total</td><td class="num strong">${fmt(total, ccy)}</td></tr></tbody>
        </table></div>`);
    } else {
      // Line-by-line, same shape as the unapplied modal, with an exception-type column
      const rows = open.slice().sort((a, b) => b.ageDays - a.ageDays).map((u) => `
        <tr><td class="muted" style="white-space:nowrap">${u.date}</td><td class="cell-main">${u.desc}</td><td>${pill(u.reason, u.tone)}</td><td class="num strong">${fmt(u.amount, ccy)}</td></tr>`).join("");
      openModal("Open exceptions — line by line", `
        <div class="modal-sub">All ${open.length} open exceptions from the bank statement, by exception type. Total ties to <b>${D.fmtCompact(total, ccy)}</b> (${fmt(total, ccy)}).</div>
        <div class="table-wrap table-scroll"><table class="tbl">
          <thead><tr><th>Value date</th><th>Description</th><th>Exception type</th><th class="num">Amount</th></tr></thead>
          <tbody>${rows}<tr class="modal-total"><td colspan="3" class="num">Total (${open.length})</td><td class="num strong">${fmt(total, ccy)}</td></tr></tbody>
        </table></div>`);
    }
  }

  function openModal(title, html) {
    closeModal();
    const back = document.createElement("div");
    back.className = "modal-backdrop"; back.id = "app-modal";
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="modal__head"><div class="modal__title">${title}</div><button class="modal__close" aria-label="Close">&times;</button></div>
      <div class="modal__body">${html}</div>
    </div>`;
    document.body.appendChild(back);
    back.onclick = (e) => { if (e.target === back) closeModal(); };
    back.querySelector(".modal__close").onclick = closeModal;
    document.addEventListener("keydown", modalEsc);
  }
  function closeModal() { const m = document.getElementById("app-modal"); if (m) m.remove(); document.removeEventListener("keydown", modalEsc); }
  function modalEsc(e) { if (e.key === "Escape") closeModal(); }

  // ── Info popover for (i) buttons ────────────────────────────────────────
  function showInfo(anchor, text) {
    const existing = document.getElementById("info-pop"); if (existing) existing.remove();
    const pop = document.createElement("div");
    pop.className = "info-pop"; pop.id = "info-pop"; pop.textContent = text;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(r.left, window.innerWidth - pop.offsetWidth - 12) + "px";
    pop.style.top = (r.bottom + 6) + "px";
    const close = (e) => { if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); document.removeEventListener("mousedown", close); } };
    setTimeout(() => document.addEventListener("mousedown", close), 0);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  WORKSPACE  (analyst cockpit + queue)
  // ════════════════════════════════════════════════════════════════════════
  let activeReceiptId = null;
  const _cockpit = {};                       // per credit, so edits persist across renders
  const postedIds = new Set();               // credits that have been applied & posted (drop from the open queue)
  const postedKey = (id) => selectedEntityId + ":" + id;

  // Workspace queue search + sort state
  let wsSearch = "", wsSortKey = "date", wsSortDir = "asc";

  function applyQueueFilter(list) {
    const q = wsSearch.trim().toLowerCase();
    let out = q ? list.filter((x) =>
      x.desc.toLowerCase().includes(q) ||
      (x.customer && x.customer !== "— unidentified —" && x.customer.toLowerCase().includes(q)) ||
      x.id.toLowerCase().includes(q)
    ) : list.slice();
    out.sort((a, b) => {
      // Pin the curated AI-match showcases to the top of the queue, in showcase order.
      if (!!a.ai !== !!b.ai) return a.ai ? -1 : 1;
      if (a.ai && b.ai) return a.ai.rank - b.ai.rank;
      let av, bv;
      if (wsSortKey === "amount")   { av = a.amount;   bv = b.amount; }
      else if (wsSortKey === "customer") { av = (a.customer || "").toLowerCase(); bv = (b.customer || "").toLowerCase(); }
      else if (wsSortKey === "desc") { av = a.desc.toLowerCase(); bv = b.desc.toLowerCase(); }
      else { av = a.date; bv = b.date; }
      if (av < bv) return wsSortDir === "asc" ? -1 : 1;
      if (av > bv) return wsSortDir === "asc" ? 1 : -1;
      return 0;
    });
    return out;
  }

  function sortChevron(key) {
    if (wsSortKey !== key) return `<span class="sort-chev sort-chev--none">⇅</span>`;
    return wsSortDir === "asc"
      ? `<span class="sort-chev sort-chev--active">↑</span>`
      : `<span class="sort-chev sort-chev--active">↓</span>`;
  }

  function buildQueueRows(list, ccy, r) {
    const filtered = applyQueueFilter(list);
    if (!filtered.length) {
      const msg = wsSearch.trim() ? "No results" : "All credits applied";
      const sub = wsSearch.trim() ? "Try a different search term." : "Every open credit has been posted.";
      return { rows: `<tr><td colspan="5">${emptyState(msg, sub)}</td></tr>`, count: 0 };
    }
    return {
      rows: filtered.map((x) => `
        <tr class="queue-row ${x.id === r.id ? "is-active" : ""}" data-rid="${x.id}">
          <td class="muted" style="white-space:nowrap">${x.date}</td>
          <td><div class="cell-main" style="font-weight:var(--font-weight-medium)">${x.desc}</div><div class="cell-sub">${bankName()} · ref ${x.id}</div></td>
          <td class="num strong">${fmt(x.amount, ccy)}</td>
          <td>${x.customer === "— unidentified —" ? `<span class="pill pill--error">Unidentified</span>` : `<span class="cell-main">${x.customer}</span>`}</td>
          <td class="dot-conf">${confOf(x)}</td>
        </tr>`).join(""),
      count: filtered.length,
    };
  }
  function bankName() { const b = D.banks.find((x) => x.id === selectedBankId); return b ? b.name : "—"; }
  function confOf(it) { return it.reason === "Unidentified customer" ? "—" : (it.ai ? it.ai.confidence : 1.0).toFixed(2); }
  function getCredit(id) {
    const db = D.dashboardFor(selectedEntityId);
    const it = (id && db.list.find((x) => x.id === id)) || db.list[0];
    const key = selectedEntityId + ":" + it.id;
    if (!_cockpit[key]) {
      const cp = D.buildCockpit(it, db.ccy, selectedEntityId);
      _cockpit[key] = { id: it.id, bankRef: it.id, amount: it.amount, ccy: db.ccy, valueDate: it.date,
        narration: it.desc, bankAcct: bankName(), customer: cp.customer, aiCustomer: cp.aiCustomer, invoices: cp.invoices, available: cp.available || [],
        gap: cp.gap, remittance: cp.remittance, aiConf: cp.aiConf, sla: cp.sla, reason: it.reason };
    } else { _cockpit[key].bankAcct = bankName(); }
    return _cockpit[key];
  }

  function viewWorkspace() {
    const db = D.dashboardFor(selectedEntityId), ccy = db.ccy;
    // Only the credits still open — posted ones drop out of the queue.
    const openList = db.list.filter((x) => !postedIds.has(postedKey(x.id)));
    if (!openList.some((x) => x.id === activeReceiptId)) activeReceiptId = (openList[0] || db.list[0]).id;
    const r = getCredit(activeReceiptId); activeReceiptId = r.id;
    setTopbar("Apply cash", "Match each bank credit to open invoices, classify the gap, and post to the ERP",
      `<span class="topbar__chip"><span>Entity</span> ${currentEntity().name}</span>${bankSelectChip()}`,
      uploadStmtAction());

    const { rows: queueRows, count: queueCount } = openList.length
      ? buildQueueRows(openList, ccy, r)
      : { rows: `<tr><td colspan="5">${emptyState("All credits applied", "Every open credit for this account has been posted. Upload a new statement to continue.")}</td></tr>`, count: 0 };

    content.innerHTML = `
      <div class="section">
        <div class="card">
          <div class="card__head">
            <div class="card__title">Bank statement — open &amp; unapplied credits</div>
            <span class="muted" style="font-size:12px" id="ws-count">${queueCount} of ${openList.length} shown</span>
            <div class="ws-search-wrap">
              <input id="ws-search" class="ws-search-input" type="search" placeholder="Search description, customer, ref…" value="${wsSearch.replace(/"/g, '&quot;')}" autocomplete="off" />
            </div>
          </div>
          <div class="card__body card__body--flush"><div class="table-wrap ws-queue-scroll" id="ws-queue-scroll"><table class="tbl tbl--fixed">
            <colgroup><col style="width:11%"><col style="width:42%"><col style="width:15%"><col style="width:22%"><col style="width:10%"></colgroup>
            <thead><tr>
              <th class="ws-sort-th" data-sort="date">Date ${sortChevron("date")}</th>
              <th class="ws-sort-th" data-sort="desc">Description ${sortChevron("desc")}</th>
              <th class="num ws-sort-th" data-sort="amount">Amount ${sortChevron("amount")}</th>
              <th class="ws-sort-th" data-sort="customer">Identified customer ${sortChevron("customer")}</th>
              <th>Conf.</th>
            </tr></thead>
            <tbody id="ws-queue-tbody">${queueRows}</tbody>
          </table></div></div>
        </div>
      </div>
      <div id="cockpit"></div>`;

    wireBankBar();

    // Wire sort headers
    content.querySelectorAll(".ws-sort-th").forEach((th) => {
      th.style.cursor = "pointer";
      th.style.userSelect = "none";
      th.onclick = () => {
        const key = th.dataset.sort;
        if (wsSortKey === key) { wsSortDir = wsSortDir === "asc" ? "desc" : "asc"; }
        else { wsSortKey = key; wsSortDir = key === "amount" ? "desc" : "asc"; }
        refreshQueueTable(openList, ccy, r);
      };
    });

    // Wire search input
    const searchEl = $("#ws-search");
    if (searchEl) {
      searchEl.oninput = () => { wsSearch = searchEl.value; refreshQueueTable(openList, ccy, r); };
      searchEl.onclick = (e) => e.stopPropagation();
    }

    function refreshQueueTable(list, ccy, r) {
      const tbody = $("#ws-queue-tbody");
      const countEl = $("#ws-count");
      if (!tbody) return;
      const { rows, count } = buildQueueRows(list, ccy, r);
      tbody.innerHTML = rows;
      if (countEl) countEl.textContent = `${count} of ${list.length} shown`;
      // update sort chevrons in headers
      content.querySelectorAll(".ws-sort-th").forEach((th) => {
        const key = th.dataset.sort;
        const chev = th.querySelector(".sort-chev");
        if (chev) {
          if (wsSortKey === key) {
            chev.textContent = wsSortDir === "asc" ? "↑" : "↓";
            chev.className = "sort-chev sort-chev--active";
          } else {
            chev.textContent = "⇅";
            chev.className = "sort-chev sort-chev--none";
          }
        }
      });
      wireQueueRows();
    }

    function wireQueueRows() {
      content.querySelectorAll(".queue-row").forEach((row) => {
        row.onclick = () => { activeReceiptId = row.dataset.rid; viewWorkspace(); };
      });
      const arow = content.querySelector(".queue-row.is-active");
      if (arow) arow.scrollIntoView({ block: "nearest" });
    }

    wireQueueRows();

    renderCockpit(r);
  }

  function renderCockpit(r) {
    const cockpit = $("#cockpit");
    if (!r._orig) r._orig = JSON.parse(JSON.stringify(r.invoices));   // snapshot for "Remittance" rule
    r.adjustments = r.adjustments || [];
    // left pane
    const confPill = (c) => `<span class="conf-pill ${c >= 0.85 ? "hi" : c >= 0.7 ? "mid" : "lo"}">${Math.round(c * 100)}% match</span>`;
    const identified = r.customer ? `
      <div class="identified-box">
        <div class="id-name-row"><span class="name">${r.customer.name}</span>${confPill(r.customer.confidence)}</div>
        <div class="howline">how: ${r.customer.how}</div>
        <button class="btn btn--ghost btn--sm" id="change-customer" style="margin-top:10px">Change customer</button>
      </div>` : (r.aiCustomer ? `
      <div class="identified-box identified-box--ai">
        <div class="ai-suggest__head"><span class="ai-suggest__spark">${aiSparkSvg}</span><span class="ai-suggest__name">Neoflo AI · suggested match</span><span class="ai-suggest__conf">${Math.round(r.aiCustomer.confidence * 100)}% match</span></div>
        <div class="ai-cust">
          <div class="ai-cust__avatar">${initialsOf(r.aiCustomer.name)}</div>
          <div class="ai-cust__meta">
            <div class="ai-cust__name">${r.aiCustomer.name}</div>
            <div class="ai-cust__why">${r.aiCustomer.how.charAt(0).toUpperCase() + r.aiCustomer.how.slice(1)}. Accept to pull their open invoices and propose a match.</div>
          </div>
        </div>
        <div class="ai-suggest__acts"><button class="btn btn--success btn--sm" id="ai-accept-cust">Accept match</button><button class="btn btn--ghost btn--sm" id="change-customer">Not a match — pick another</button></div>
      </div>` : `
      <div class="identified-box" style="border-color:var(--border-error-default);background:var(--surface-error-subtle)">
        <div class="name" style="color:var(--text-error-hover)">No customer resolved</div>
        <div class="howline">Routed to suspense — pick the right customer.</div>
        <button class="btn btn--ghost btn--sm" id="change-customer" style="margin-top:10px">Pick customer</button>
      </div>`);

    const remit = r.remittance.listed ? `
      <div class="remit-linked"><b>RA-${r.bankRef}</b> linked · ${r.remittance.listed} invoices · parse confidence ${Math.round(r.remittance.parsed * 100)}%</div>
      <a class="remit-link" id="view-remit">View remittance advice ↗</a>`
      : `<div class="muted">No remittance advice matched to this credit yet.</div>`;

    const left = `
      <div class="ws-pane ws-pane--credit">
        <div class="credit-cols">
          <div class="credit-col">
            <div class="ws-pane__title" style="padding:0 0 var(--scale-200)">The credit</div>
            <div class="credit-amount">${fmt(r.amount, r.ccy)}<span class="credit-amount__tag">received</span></div>
            <dl class="kv">
              <dt>Value date</dt><dd>${r.valueDate}</dd>
              <dt>Bank a/c</dt><dd>${r.bankAcct}</dd>
              <dt>Narration</dt><dd class="kv__narr">${r.narration}</dd>
            </dl>
          </div>
          <div class="credit-col">
            <div class="ws-pane__title" style="padding:0 0 var(--scale-200)">Identified customer</div>
            ${identified}
          </div>
          <div class="credit-col">
            <div class="ws-pane__title" style="padding:0 0 var(--scale-200)">Remittance advice</div>
            <div class="remit-box">
              ${remit}
              <div class="remit-actions">
                <button class="btn btn--ghost btn--sm" id="upload-remit">Upload remittance</button>
                <input type="file" id="remit-file" style="display:none" accept=".pdf,.eml,.csv,.xlsx,.xls,.png,.jpg" />
              </div>
              <div class="remit-hint">Upload a remittance advice (PDF / email / CSV) to link the payment to its invoices.</div>
            </div>
          </div>
        </div>
      </div>`;

    // middle pane — allocation with per-invoice WHT + discount
    const ccy = r.ccy, num = (n) => fmt(n, ccy).replace(ccy + " ", "");
    const cleared = (i) => i.apply + (i.wht || 0) + (i.discount || 0);
    const allocated = r.invoices.filter((i) => i.sel).reduce((s, i) => s + i.apply, 0);
    const whtTotal = r.invoices.filter((i) => i.sel).reduce((s, i) => s + (i.wht || 0), 0);
    const discTotal = r.invoices.filter((i) => i.sel).reduce((s, i) => s + (i.discount || 0), 0);
    const bankCharge = r.gap.bankCharge || 0;
    const onAccount = r.gap.onAccount || 0;
    const rebateTotal = r.gap.rebate || 0;
    // O2C: cash received can fall SHORT of the invoices for legitimate reasons — WHT
    // and cash discount (per line, already inside `allocated`), bank charges deducted in
    // transit, and agreed rebates / deductions reduce a short; an overpayment is parked
    // on-account. Every field uses the EXACT amount entered (no clamping) — over-entering
    // a deduction simply flips the variance the other way ("X over") so the analyst can
    // see it and correct, rather than the figure being silently capped.
    const grossGap = allocated - r.amount;                    // + short, − overpay (post per-line WHT/disc)
    const isOverpay = grossGap < -0.5;                        // cash received exceeds the invoices
    const isShort = grossGap > 0.5;                           // cash received is less than the invoices
    const unexplained = grossGap - bankCharge - rebateTotal + onAccount;
    const exact = Math.abs(unexplained) < 0.5;
    const canPost = exact && r.invoices.some((i) => i.sel);
    // ── Neoflo AI gap classifier ──────────────────────────────────────────────
    // Suggest how to classify the remaining gap, with an exact value the analyst
    // validates. The "kind" is the pattern Neoflo detected for this receipt; the
    // amount is the live unexplained residual (so it always closes the gap to 0).
    const grossOpenSel = r.invoices.filter((i) => i.sel).reduce((s, i) => s + i.open, 0);
    let aiSug = null;
    if (!r._aiDismissed && exact === false) {
      const gap = Math.abs(unexplained);
      const pct = grossOpenSel ? Math.round((gap / grossOpenSel) * 1000) / 10 : 0;
      const cust = r.customer ? r.customer.name : "this payer";
      if (isShort) {
        const kind = r.gap.aiKind || "wht";
        const rate = r.gap.aiRate ? Math.round(r.gap.aiRate * 1000) / 10 : pct;
        const DEF = {
          wht:        { field: "wht",        label: "Withholding tax (WHT)", conf: 0.96, why: `≈ ${rate}% of the invoice value — a textbook ${rate}% WHT deduction. Certificate typically follows; book it as WHT receivable.` },
          discount:   { field: "discount",   label: "Cash discount",         conf: 0.93, why: `≈ ${rate}% — matches an early-payment cash discount on ${cust}'s terms.` },
          bankcharge: { field: "bankcharge", label: "Bank charge",           conf: 0.9,  why: `a small flat amount typical of a cross-border transfer fee deducted in transit.` },
          rebate:     { field: "rebate",     label: "Rebate / deduction",    conf: 0.88, why: `≈ ${rate}% — consistent with the agreed volume rebate for ${cust}.` },
        };
        const d = DEF[kind] || DEF.wht;
        aiSug = { kind, field: d.field, label: d.label, amount: Math.round(gap * 100) / 100, conf: d.conf, why: d.why };
      } else if (isOverpay) {
        aiSug = { kind: "onaccount", field: "onaccount", label: "Park on-account", amount: Math.round(gap * 100) / 100, conf: 0.95, why: `cash received exceeds the matched invoices — hold the ${fmt(gap, ccy)} surplus as a customer advance (on-account).` };
      }
    }
    const balText = (u, ex) => ex ? "Balanced" : (u > 0 ? num(u) + " to explain" : num(-u) + " over");
    const anyPartial = r.invoices.some((i) => i.sel && cleared(i) > 0 && cleared(i) < i.open - 0.5);
    const rows = r.invoices.length ? r.invoices.map((i, idx) => {
      const cl = cleared(i);
      const partial = i.sel && cl > 0 && cl < i.open - 0.5;
      const balanceOpen = Math.max(0, Math.round((i.open - cl) * 100) / 100);
      return `
      <tr class="${partial ? "row-partial" : ""}">
        <td><span class="chk ${i.sel ? "on" : ""}" data-toggle="${idx}" role="checkbox" aria-checked="${i.sel}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></span></td>
        <td class="cell-main">${i.inv}${partial ? ` <span class="pill pill--warn pill--plain" style="padding:1px 7px">Partial</span><div class="cell-sub">${num(balanceOpen)} kept open</div>` : ""}</td>
        <td class="muted">${i.due}</td>
        <td class="num">${num(i.open)}</td>
        <td class="num"><input class="line-in ${partial ? "is-set" : ""}" data-i="${idx}" data-f="apply" inputmode="decimal" value="${i.apply || ""}" placeholder="0" ${i.sel ? "" : "disabled"} /></td>
        <td class="num"><input class="line-in" data-i="${idx}" data-f="wht" inputmode="decimal" value="${i.wht || ""}" placeholder="0" ${i.sel ? "" : "disabled"} /></td>
        <td class="num"><input class="line-in" data-i="${idx}" data-f="discount" inputmode="decimal" value="${i.discount || ""}" placeholder="0" ${i.sel ? "" : "disabled"} /></td>
      </tr>`; }).join("") : `<tr><td colspan="7">${emptyState("No open invoices to allocate", "Identify the customer first — the credit is in suspense.")}</td></tr>`;

    const mid = `
      <div class="ws-pane">
        <div class="ws-pane__title">Open invoices — proposed allocation</div>
        <p class="gap-explain" style="padding:0 var(--scale-400)">Edit <b>Applied</b> to part-pay an invoice — the balance stays open. WHT / discount are deductions on the cleared portion.</p>
        <div class="table-wrap" style="padding:8px 8px 0"><table class="tbl tbl--fixed alloc-tbl">
          <colgroup><col style="width:7%"><col style="width:27%"><col style="width:17%"><col style="width:15%"><col style="width:14%"><col style="width:10%"><col style="width:10%"></colgroup>
          <thead><tr><th>✓</th><th>Invoice</th><th>Due</th><th class="num">Open</th><th class="num">Applied</th><th class="num">WHT</th><th class="num">Disc.</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        ${r.available && r.available.length ? `<div class="add-inv"><span>Add invoice</span>
          <select id="add-inv-sel"><option value="">— select a relevant open invoice —</option>${r.available.map((a, j) => `<option value="${j}">${a.inv} · due ${a.due} · ${num(a.open)}</option>`).join("")}</select>
          <button class="btn btn--ghost btn--sm" id="add-inv-btn">Add</button></div>` : ""}
        <div class="alloc-summary">
          <span class="as-item">Receipt <b>${num(r.amount)}</b></span>
          <span class="as-sep">vs</span>
          <span class="as-item">Invoices <b>${num(grossOpenSel)}</b></span>
          ${(whtTotal + discTotal) ? `<span class="as-item">WHT / disc <b>${num(whtTotal + discTotal)}</b></span>` : ""}
          <span class="as-grow"></span>
          <span class="bal-chip ${exact ? "ok" : "warn"}" id="alloc-var">${balText(unexplained, exact)}</span>
        </div>
        <div class="gap-note ${exact ? "is-ok" : ""}">${r.gap.note}</div>
        ${anyPartial && !r._partialOk ? `<div class="partial-banner">
          <span>⚠ <b>Partial match</b> — an invoice is only part-paid. Is this correct?</span>
          <span class="partial-banner__btns"><button class="btn btn--success btn--sm" id="partial-yes">Yes, confirm</button><button class="btn btn--ghost btn--sm" id="partial-no">No, re-work</button></span>
        </div>` : ""}
      </div>`;

    // right pane — gap: total-level adjustments grouped (bank charge, rebate, on-account).
    // WHT & discount are per-invoice (in the allocation table) and shown read-only.
    const rebateType = r.gap.rebateType || "Rebate";
    const rebTypes = ["Rebate", "Agreed deduction", "Claim", "GST/VAT"];
    const right = `
      <div class="ws-pane">
        <div class="ws-pane__title">Gap classification</div>
        <div class="ws-pane__body">
          <p class="gap-explain">WHT &amp; discount are taken <b>per invoice</b> (allocation table). Bank charge, rebate/deduction and on-account are <b>total-level</b>.</p>
          ${aiSug ? `<div class="ai-suggest" id="ai-suggest">
            <div class="ai-suggest__head"><span class="ai-suggest__spark">${aiSparkSvg}</span><span class="ai-suggest__name">Neoflo AI · gap classifier</span><span class="ai-suggest__conf">${Math.round(aiSug.conf * 100)}% match</span></div>
            <div class="ai-suggest__body">The <b>${fmt(aiSug.amount, r.ccy)}</b> ${isOverpay ? "surplus" : "shortfall"} looks like <b>${aiSug.label}</b> — ${aiSug.why}</div>
            <div class="ai-suggest__acts"><button class="btn btn--success btn--sm" id="ai-accept">Accept &amp; apply</button><button class="lnk-clear" id="ai-dismiss">Dismiss</button></div>
          </div>` : ""}
          <div class="gap-group">
            <div class="gap-irow ${aiSug && aiSug.field === "bankcharge" ? "gap-irow--ai" : ""}"><span class="lbl">Bank charge${aiSug && aiSug.field === "bankcharge" ? ` <span class="ai-chip">${aiSparkSvg} AI ${num(aiSug.amount)}</span>` : ""}</span><span class="gap-input"><span class="gap-ccy">${r.ccy}</span><input class="gap-in" id="bankcharge-in" inputmode="decimal" value="${bankCharge || ""}" placeholder="0.00" /></span></div>
            <div class="gap-irow ${aiSug && aiSug.field === "rebate" ? "gap-irow--ai" : ""}"><span class="lbl">Rebate / deduction${aiSug && aiSug.field === "rebate" ? ` <span class="ai-chip">${aiSparkSvg} AI ${num(aiSug.amount)}</span>` : ""} <select id="rebate-type" class="gap-sel">${rebTypes.map((t) => `<option ${t === rebateType ? "selected" : ""}>${t}</option>`).join("")}</select></span><span class="gap-input"><span class="gap-ccy">${r.ccy}</span><input class="gap-in" id="rebate-in" inputmode="decimal" value="${rebateTotal || ""}" placeholder="0.00" /></span></div>
            <div class="gap-irow ${isOverpay ? "" : "gap-irow--off"}"><span class="lbl">On account ${isOverpay && Math.abs(unexplained) > 0.5 ? `<button class="lnk-clear" id="park-oa">park overpayment</button>` : (onAccount > 0 ? `<button class="lnk-clear" id="clear-oa">clear</button>` : "")}</span><span class="gap-input"><span class="gap-ccy">${r.ccy}</span><input class="gap-in ${onAccount ? "is-set" : ""}" id="onaccount-in" inputmode="decimal" value="${onAccount || ""}" placeholder="0.00" ${isOverpay ? "" : "disabled"} title="${isOverpay ? "" : "Only for overpayments — enabled when cash received exceeds the invoices."}" /></span></div>
          </div>
          <div class="gap-derived">
            <span>WHT (per-invoice) <b>${whtTotal ? num(whtTotal) : "—"}</b>${whtTotal ? ` <button class="lnk-clear" id="clear-wht">clear</button>` : ""}</span>
            <span>Discount (per-invoice) <b>${discTotal ? num(discTotal) : "—"}</b></span>
          </div>
          <div class="gap-unex ${exact ? "ok" : "warn"}" id="gap-unex"><span class="gap-unex__lbl">${exact ? "Receipt balanced" : "Unexplained"}</span><b>${exact ? "✓ 0.00" : (unexplained < 0 ? "+ " : "− ") + Math.abs(unexplained).toFixed(2)}</b></div>

          <button class="btn btn--ghost btn--block" id="simulate-entry" style="margin-top:14px">Simulate accounting entry</button>
          <div class="actions-grid">
            <button class="btn btn--success ws-action ws-action--primary" data-act="apply" ${canPost ? "" : "disabled"}>Apply &amp; post</button>
          </div>
          ${canPost ? "" : `<div class="post-hint">Balance the receipt before posting — explain the gap (WHT / discount / bank charge / rebate) or park the residual <b>on account</b>.</div>`}
          <div class="ws-foot"><span>AI confidence <b class="conf">${r.aiConf.toFixed(2)}</b></span><span>SLA <b class="sla">${r.sla}</b></span></div>
        </div>
      </div>`;

    cockpit.innerHTML = `<div class="workspace">${left}<div class="ws-bottom">${mid}${right}</div></div>`;

    cockpit.querySelectorAll("[data-act]").forEach((b) => {
      b.onclick = () => actionConfirm(b.dataset.act, r);
    });
    const cc = $("#change-customer");
    if (cc) cc.onclick = () => openCustomerPicker(r);
    const acAi = $("#ai-accept-cust");
    if (acAi && r.aiCustomer) acAi.onclick = () => { setCustomer(r, r.aiCustomer.name, "Neoflo AI match, verified by analyst", r.aiCustomer.confidence); toast(`${r.aiCustomer.name} confirmed — open invoices fetched`); };
    const sim = $("#simulate-entry");
    if (sim) sim.onclick = () => simulateEntry(r);

    // per-invoice select toggle + editable Applied / WHT / discount.
    // maxApply = open − WHT − discount; full clearance applies that, a partial leaves a balance open.
    const maxApplyOf = (i) => Math.max(0, Math.round((i.open - (i.wht || 0) - (i.discount || 0)) * 100) / 100);
    const recomputeLine = (i) => { i.apply = maxApplyOf(i); i._partialSet = false; };
    cockpit.querySelectorAll(".chk[data-toggle]").forEach((el) => {
      el.onclick = () => { const i = r.invoices[+el.dataset.toggle]; i.sel = !i.sel; if (i.sel && !i.apply) recomputeLine(i); if (!i.sel) { i.apply = 0; i._partialSet = false; } r._partialOk = false; renderCockpit(r); };
    });
    cockpit.querySelectorAll(".line-in").forEach((inp) => {
      inp.onchange = () => {
        const i = r.invoices[+inp.dataset.i], f = inp.dataset.f, val = Math.max(0, parseFloat(inp.value) || 0);
        if (f === "apply") {
          const cap = maxApplyOf(i);
          i.apply = Math.min(val, cap);
          i._partialSet = i.apply < cap - 0.5;        // user chose a partial application
        } else {
          i[f] = val;
          const cap = maxApplyOf(i);
          i.apply = i._partialSet ? Math.min(i.apply, cap) : cap;   // keep a chosen partial, else full
        }
        r._partialOk = false; renderCockpit(r);
      };
    });
    const clrWht = $("#clear-wht");
    if (clrWht) clrWht.onclick = () => { r.invoices.forEach((i) => { i.wht = 0; if (!i._partialSet) i.apply = maxApplyOf(i); }); renderCockpit(r); toast("Auto-applied WHT removed"); };
    // Live variance feedback as the user types in any gap field — patches the numbers
    // and the Apply button without a full re-render (so focus / caret are preserved).
    // The authoritative full re-render happens on `change` (blur) below.
    const liveGap = () => {
      const bc = Math.max(0, parseFloat(($("#bankcharge-in") || {}).value) || 0);
      const rb = Math.max(0, parseFloat(($("#rebate-in") || {}).value) || 0);
      const oaV = Math.max(0, parseFloat(($("#onaccount-in") || {}).value) || 0);
      const gg = allocated - r.amount;
      const unex = gg - bc - rb + oaV;
      const ok = Math.abs(unex) < 0.5;
      const av = $("#alloc-var");
      if (av) { av.className = "bal-chip " + (ok ? "ok" : "warn"); av.textContent = balText(unex, ok); }
      const gu = $("#gap-unex");
      if (gu) {
        gu.className = "gap-unex " + (ok ? "ok" : "warn");
        gu.querySelector(".gap-unex__lbl").textContent = ok ? "Receipt balanced" : "Unexplained";
        gu.querySelector("b").textContent = ok ? "✓ 0.00" : (unex < 0 ? "+ " : "− ") + Math.abs(unex).toFixed(2);
      }
      const ap = $('[data-act="apply"]');
      if (ap) ap.disabled = !(ok && r.invoices.some((i) => i.sel));
    };
    const bcIn = $("#bankcharge-in");
    if (bcIn) { bcIn.oninput = liveGap; bcIn.onchange = () => { r.gap.bankCharge = Math.max(0, parseFloat(bcIn.value) || 0); renderCockpit(r); }; }

    // add a relevant open invoice to the allocation
    const addBtn = $("#add-inv-btn"), addSel = $("#add-inv-sel");
    if (addBtn && addSel) addBtn.onclick = () => {
      const j = addSel.value; if (j === "") return;
      const a = r.available.splice(+j, 1)[0]; a.sel = true; a.apply = a.open;
      r.invoices.push(a); renderCockpit(r); toast(`Added ${a.inv} to the allocation`);
    };

    // AI suggestion — apply the proposed classification; the analyst just validates it.
    const aiAccept = $("#ai-accept");
    if (aiAccept && aiSug) aiAccept.onclick = () => {
      const amt = aiSug.amount;
      if (aiSug.field === "wht" || aiSug.field === "discount") {
        // distribute across the selected invoices, proportional to open value
        const sel = r.invoices.filter((i) => i.sel);
        if (!sel.length) return;
        const totalOpen = sel.reduce((s, i) => s + i.open, 0) || 1;
        let rem = Math.round(amt * 100) / 100;
        sel.forEach((i, k) => {
          const add = k === sel.length - 1 ? rem : Math.round(amt * i.open / totalOpen);
          rem = Math.round((rem - add) * 100) / 100;
          i[aiSug.field] = Math.round((((i[aiSug.field]) || 0) + add) * 100) / 100;
          i.apply = Math.max(0, Math.round((i.open - (i.wht || 0) - (i.discount || 0)) * 100) / 100);
        });
      } else if (aiSug.field === "bankcharge") {
        r.gap.bankCharge = Math.round(((r.gap.bankCharge || 0) + amt) * 100) / 100;
      } else if (aiSug.field === "rebate") {
        r.gap.rebate = Math.round(((r.gap.rebate || 0) + amt) * 100) / 100;
      } else if (aiSug.field === "onaccount") {
        r.gap.onAccount = Math.round(((r.gap.onAccount || 0) + amt) * 100) / 100;
      }
      renderCockpit(r); toast(`AI applied ${fmt(amt, r.ccy)} as ${aiSug.label.toLowerCase()} — please review`);
    };
    const aiDismiss = $("#ai-dismiss");
    if (aiDismiss) aiDismiss.onclick = () => { r._aiDismissed = true; renderCockpit(r); };

    // on-account (park overpayment / clear / edit) — only for overpayments
    const parkOa = $("#park-oa");
    if (parkOa) parkOa.onclick = () => { const amt = Math.round(Math.max(0, -grossGap) * 100) / 100; r.gap.onAccount = amt; renderCockpit(r); toast(`Parked ${fmt(amt, r.ccy)} on account`); };
    const clrOa = $("#clear-oa");
    if (clrOa) clrOa.onclick = () => { r.gap.onAccount = 0; renderCockpit(r); };
    const oaIn = $("#onaccount-in");
    if (oaIn) { oaIn.oninput = liveGap; oaIn.onchange = () => { r.gap.onAccount = Math.max(0, parseFloat(oaIn.value) || 0); renderCockpit(r); }; }

    // real partial flow
    const py = $("#partial-yes");
    if (py) py.onclick = () => { r._partialOk = true; renderCockpit(r); toast("Partial confirmed — balance kept open on the invoice"); };
    const pn = $("#partial-no");
    if (pn) pn.onclick = () => { delete _cockpit[selectedEntityId + ":" + r.id]; activeReceiptId = r.id; viewWorkspace(); toast("Sent for re-work — allocation reset"); };

    // total-level rebate / deduction (single field, grouped with bank charge & on-account)
    const rebIn = $("#rebate-in");
    if (rebIn) { rebIn.oninput = liveGap; rebIn.onchange = () => { r.gap.rebate = Math.max(0, parseFloat(rebIn.value) || 0); renderCockpit(r); }; }
    const rebType = $("#rebate-type");
    if (rebType) rebType.onchange = () => { r.gap.rebateType = rebType.value; renderCockpit(r); };

    // remittance advice upload / view
    const up = $("#upload-remit"), rf = $("#remit-file");
    if (up && rf) {
      up.onclick = () => rf.click();
      rf.onchange = () => {
        if (!rf.files[0]) return;
        r.remittance = { listed: r.remittance.listed || 3, parsed: 0.93, file: rf.files[0].name };
        renderCockpit(r); toast(`Remittance ${rf.files[0].name} linked · payment reference matched`);
      };
    }
    const vr = $("#view-remit");
    if (vr) vr.onclick = () => viewRemittance(r);
  }

  // Re-allocate the receipt across invoices by the chosen rule (visibly changes)
  function reallocate(r, rule) {
    if (!r.invoices || !r.invoices.length) return;
    r.gap.allocRule = rule;
    if (rule === "Remittance") {                       // restore the remittance-directed snapshot
      r.invoices = JSON.parse(JSON.stringify(r._orig));
      return;
    }
    let order = r.invoices.slice();
    if (rule === "FIFO (oldest-first)" || rule === "By due date") order.sort((a, b) => (a.due < b.due ? -1 : 1));
    else if (rule === "Exact") order.sort((a, b) => Math.abs(a.open - r.amount) - Math.abs(b.open - r.amount));
    r.invoices.forEach((i) => { i.sel = false; i.apply = 0; });
    let remaining = r.amount;
    for (const i of order) {
      if (remaining <= 0.001) break;
      const ap = Math.min(i.open, remaining);
      i.apply = Math.round(ap * 100) / 100; i.sel = ap > 0; remaining -= ap;
    }
  }

  // Show the parsed remittance advice lines
  function viewRemittance(r) {
    const ccy = r.ccy, cust = r.customer ? r.customer.name : "—";
    const inv = r.invoices.filter((i) => i.sel);
    // Each line ties: Paid = Gross − WHT − discount. The column then sums to the cash
    // actually received (r.amount); any residual short / overpayment is shown as its
    // own reconciling line so the advice always balances to the remittance total.
    const invDate = (d) => { const t = new Date(d + "T00:00:00"); t.setDate(t.getDate() - 30); return t.toISOString().slice(0, 10); };
    const L = inv.map((i) => ({ i, gross: i.open, wht: i.wht || 0, disc: i.discount || 0, paid: Math.max(0, Math.round((i.open - (i.wht || 0) - (i.discount || 0)) * 100) / 100) }));
    const grossTotal = L.reduce((s, x) => s + x.gross, 0);
    const whtTotal = L.reduce((s, x) => s + x.wht, 0);
    const netPaid = L.reduce((s, x) => s + x.paid, 0);
    const shortAdj = Math.round((netPaid - r.amount) * 100) / 100;   // > 0 customer deducted more (short); < 0 overpaid
    const lineRows = L.length ? L.map((x) => `<tr><td class="cell-main">${x.i.inv}</td><td class="muted">${invDate(x.i.due)}</td><td class="muted">${x.i.due}</td><td class="num">${fmt(x.gross, ccy)}</td><td class="num">${x.wht ? "− " + fmt(x.wht, ccy) : "—"}</td><td class="num strong">${fmt(x.paid, ccy)}</td></tr>`).join("") : `<tr><td colspan="6" class="muted">No lines.</td></tr>`;
    const adjRow = shortAdj > 0.5 ? `<tr><td class="cell-main">Deduction / short payment</td><td class="muted">—</td><td class="muted">—</td><td class="num">—</td><td class="num">− ${fmt(shortAdj, ccy)}</td><td class="num strong">− ${fmt(shortAdj, ccy)}</td></tr>`
      : shortAdj < -0.5 ? `<tr><td class="cell-main">Payment on account (advance)</td><td class="muted">—</td><td class="muted">—</td><td class="num">—</td><td class="num">—</td><td class="num strong">${fmt(-shortAdj, ccy)}</td></tr>` : "";
    const swift = { Singapore: "DBSSSGSG", Malaysia: "MBBEMYKL", Indonesia: "CENAIDJA", Thailand: "SICOTHBK", Philippines: "BNORPHMM" }[currentEntity().country] || "DBSSSGSG";
    openModal(`Remittance advice (PDF) — RA-${r.bankRef}`, `
      <div class="remit-doc">
        <div class="remit-doc__head">
          <div><div class="remit-doc__logo">${cust}</div><div class="remit-doc__sub">PAYMENT / REMITTANCE ADVICE</div><div class="remit-doc__addr">Generated from SAP · F110 payment run</div></div>
          <div class="remit-doc__meta">
            <div><span>Advice no.</span> RA-${r.bankRef}</div>
            <div><span>Payment date</span> ${r.valueDate}</div>
            <div><span>Value date</span> ${r.valueDate}</div>
            <div><span>Currency</span> ${ccy}</div>
            <div><span>Document type</span> Customer payment (KZ)</div>
          </div>
        </div>
        <div class="remit-doc__party">
          <div><div class="remit-doc__plabel">Remitting party (payer)</div><b>${cust}</b><div class="muted">Bank: ${r.bankAcct} · SWIFT/BIC ${swift}</div></div>
          <div><div class="remit-doc__plabel">Beneficiary</div><b>Neoflo · ${currentEntity().name}</b><div class="muted">Bank ref ${r.bankRef} · Payment reference PMT-${r.bankRef}</div></div>
        </div>
        <table class="tbl remit-doc__tbl">
          <thead><tr><th>Invoice no.</th><th>Invoice date</th><th>Due date</th><th class="num">Gross</th><th class="num">WHT</th><th class="num">Paid</th></tr></thead>
          <tbody>${lineRows}${adjRow}
            <tr class="modal-total"><td colspan="3" class="num">Total remitted</td><td class="num">${fmt(grossTotal, ccy)}</td><td class="num">${whtTotal ? "− " + fmt(whtTotal, ccy) : "—"}</td><td class="num strong">${fmt(r.amount, ccy)}</td></tr>
          </tbody>
        </table>
        <div class="remit-doc__foot">Bank narration: <code>${r.narration}</code> · SWIFT/BIC ${swift}. ${r.remittance.file ? "Uploaded: " + escapeAttr(r.remittance.file) + "." : "Parsed from an uploaded remittance advice."} Apply the lines via the allocation table.</div>
      </div>`);
  }

  // Attribute a credit to a customer and pull THAT customer's open invoices, proposing
  // an allocation against the receipt. Re-fetches every time the customer changes, so
  // the invoice set always reflects the selected payer (never a stale/shared set).
  function setCustomer(r, name, how, conf) {
    const all = D.customersFor(selectedEntityId);
    const c = all.find((x) => x.name === name);
    r.customer = { name, id: c ? c.id : "manual", confidence: conf || 1.0, how: how || "manually set by analyst" };
    const f = D.fetchOpenInvoices(r.amount, r.ccy, name);
    r.invoices = f.invoices; r.available = f.available; r._orig = null;
    r.remittance = { listed: f.invoices.length, parsed: 0 };
    delete r._aiDismissed;
    r.gap.bankCharge = 0; r.gap.rebate = 0; r.gap.onAccount = 0;
    r.gap.note = `${f.invoices.length} open invoice${f.invoices.length > 1 ? "s" : ""} fetched for ${name} — proposed allocation matches the receipt. Review and post.`;
    renderCockpit(r);
  }

  // Reassign the credit to a different customer (lists all customers + search)
  function openCustomerPicker(r) {
    const names = D.customersPoolFor(selectedEntityId).slice().sort();
    const opts = names.map((n) => `<button class="picker-item" data-name="${escapeAttr(n)}"><span class="cell-main">${n}</span></button>`).join("");
    openModal("Change customer", `
      <div class="modal-sub">Re-attribute this credit if the suggested customer looks wrong. Your choice is logged and trains the identification model.</div>
      <input id="picker-search" placeholder="Search customers…" style="width:100%;padding:9px;border:1px solid var(--border-default-default);border-radius:var(--radius-sm);margin-bottom:10px;font-family:var(--font-family-inter);font-size:13px" />
      <div class="picker-list" id="picker-list">${opts}</div>`);
    const search = document.getElementById("picker-search");
    if (search) search.oninput = () => {
      const q = search.value.toLowerCase();
      document.querySelectorAll("#picker-list .picker-item").forEach((it) => {
        it.style.display = it.dataset.name.toLowerCase().includes(q) ? "" : "none";
      });
    };
    document.querySelectorAll(".picker-item").forEach((b) => {
      b.onclick = () => {
        const name = b.dataset.name;
        closeModal();
        setCustomer(r, name, "manually set by analyst", 1.0);
        toast(`Customer set to ${name} — open invoices refreshed`);
      };
    });
  }

  // The journal entry this application would post (PRD §12 conventions) — shared by the
  // Simulate preview and the post-success confirmation so they're guaranteed identical.
  function journalLines(r) {
    const ccy = r.ccy, cust = r.customer ? r.customer.name : "Unidentified";
    const sel = r.invoices.filter((i) => i.sel);
    const applied = sel.reduce((s, i) => s + i.apply, 0);
    const wht = sel.reduce((s, i) => s + (i.wht || 0), 0);
    const disc = sel.reduce((s, i) => s + (i.discount || 0), 0);
    const arCleared = applied + wht + disc;       // invoices cleared in full (Σ open of selected)
    const grossGap = applied - r.amount;          // > 0 short, < 0 overpay (post per-line WHT/disc)
    // Use the EXACT amounts the analyst entered (no capping).
    const bc = r.gap.bankCharge || 0, rebate = r.gap.rebate || 0, oaCredit = r.gap.onAccount || 0;
    const unexplained = grossGap - bc - rebate + oaCredit;
    const lines = [["Bank (cash received)", r.amount, 0]];
    if (wht) lines.push(["WHT receivable (asset)", wht, 0]);
    if (disc) lines.push(["Cash discount allowed (expense)", disc, 0]);
    if (bc) lines.push(["Bank charges (expense)", bc, 0]);
    if (rebate) lines.push(["Deductions / claims", rebate, 0]);
    if (arCleared) lines.push([`AR — ${cust} (invoices cleared)`, 0, arCleared]);
    if (oaCredit) lines.push(["Customer advances (on-account)", 0, oaCredit]);
    return { lines, ccy, cust, unexplained, totD: lines.reduce((s, l) => s + l[1], 0), totC: lines.reduce((s, l) => s + l[2], 0) };
  }
  // GL account code per posting line (SAP-style chart of accounts).
  function glOf(name) {
    if (name.indexOf("AR —") === 0) return "120100";
    return ({
      "Bank (cash received)": "100200",
      "WHT receivable (asset)": "142100",
      "Cash discount allowed (expense)": "510300",
      "Bank charges (expense)": "510200",
      "Deductions / claims": "142500",
      "Customer advances (on-account)": "210300",
      "On-account / unapplied cash (suspense)": "199100",
    })[name] || "—";
  }
  function jeTable(je) {
    const body = je.lines.map((l) => `<tr><td class="mono">${glOf(l[0])}</td><td class="cell-main">${l[0]}</td><td class="num">${l[1] ? fmt(l[1], je.ccy) : ""}</td><td class="num">${l[2] ? fmt(l[2], je.ccy) : ""}</td></tr>`).join("");
    return `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>G/L</th><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
        <tbody>${body}<tr class="modal-total"><td></td><td>Total</td><td class="num">${fmt(je.totD, je.ccy)}</td><td class="num">${fmt(je.totC, je.ccy)}</td></tr></tbody>
      </table></div>`;
  }
  function simulateEntry(r) {
    const je = journalLines(r);
    openModal("Simulated accounting entry", `
      <div class="modal-sub">Preview of the journal entry this application would post to the ERP. Nothing posts until you Apply &amp; post.</div>
      ${jeTable(je)}
      <div class="gap-note" style="padding:12px 0 0">${Math.abs(je.unexplained) < 0.5 ? "✓ Balanced — debits equal credits; ready to post." : (je.unexplained > 0 ? `Short by ${fmt(je.unexplained, je.ccy)} — code a deduction / rebate (or reduce the selection) so it balances.` : `Overpaid by ${fmt(-je.unexplained, je.ccy)} — park it on-account so it balances.`)}</div>`);
  }
  // Success confirmation after Apply & post — shows the real posted journal entry.
  function postSuccess(r) {
    const je = journalLines(r);
    const doc = "1900" + (4000 + (Math.abs(r.amount) % 5999));   // SAP-style clearing doc number
    const fy = "2026";
    openModal("Posted to ERP", `
      <div class="post-ok">
        <div class="post-ok__badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></div>
        <div><div class="post-ok__title">Cash applied &amp; posted</div><div class="post-ok__sub">${fmt(r.amount, je.ccy)} cleared for ${je.cust} · posted to the ERP general ledger.</div></div>
      </div>
      <div class="post-meta">
        <span>Clearing document <b>${doc}</b></span><span>Company code <b>${currentEntity().code || "1000"}</b></span><span>Fiscal year <b>${fy}</b></span><span>Posting date <b>${D.lastStatementDate}</b></span>
      </div>
      <div class="modal-sub" style="margin-top:14px">Journal entry posted</div>
      ${jeTable(je)}
      <div style="margin-top:18px;display:flex;justify-content:flex-end"><button class="btn btn--primary" id="ps-done">Done</button></div>`);
    // mark this credit as posted so it drops off the open queue, and re-render to advance
    postedIds.add(postedKey(r.id));
    const done = document.getElementById("ps-done"); if (done) done.onclick = () => { closeModal(); viewWorkspace(); };
  }

  // Action buttons open a confirmation dialog (clear, visible feedback)
  function actionConfirm(act, r) {
    const cust = r.customer ? r.customer.name : "—";
    const map = {
      apply:     { t: "Apply & post", danger: false, body: `Post <b>${fmt(r.amount, r.ccy)}</b> for <b>${cust}</b> to the ERP general ledger. The clearing document and journal entry are generated on posting.` },
      split:     { t: "Split credit", danger: false, body: `Split <b>${fmt(r.amount, r.ccy)}</b> across multiple customers / invoices before applying.` },
      park:      { t: "Park on-account", danger: false, body: `Park <b>${fmt(r.amount, r.ccy)}</b> on-account under <b>${cust}</b>, aged for follow-up — the floor outcome.` },
      deduction: { t: "Open deduction", danger: false, body: `Open a coded deduction for the short amount and route it to the claims owner.` },
      reassign:  { t: "Reassign customer", danger: false, body: `Attribute this credit to a different customer (re-runs the identification ladder).` },
      reverse:   { t: "Reverse application", danger: true, body: `Unapply the cash and reopen the invoice(s), with a full audit trail.` },
      "confirm-partial": { t: "Confirm partial match", danger: false, body: `Apply the part amount and keep the remaining balance open on the invoice.` },
      "not-correct":     { t: "Re-work allocation", danger: true, body: `Flag this proposed allocation as incorrect and send it back for re-work.` },
    };
    const m = map[act] || { t: "Action", body: "", danger: false };
    openModal(m.t, `<p style="margin:0 0 4px">${m.body}</p>
      <div style="margin-top:20px;display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn--ghost" id="ac-cancel">Cancel</button>
        <button class="btn btn--${m.danger ? "danger" : "primary"}" id="ac-confirm">Confirm</button>
      </div>`);
    document.getElementById("ac-cancel").onclick = closeModal;
    document.getElementById("ac-confirm").onclick = () => { closeModal(); if (act === "apply") { postSuccess(r); } else { toast(`${m.t} — done`); } };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  UNAPPLIED / ON-ACCOUNT
  // ════════════════════════════════════════════════════════════════════════
  function viewUnapplied() {
    const db = D.dashboardFor(selectedEntityId), ccy = db.ccy;
    const list = db.list, total = db.totalUnapplied;
    setTopbar("Unapplied / on-account cash", "Identified cash with no clean match — aged and escalated, never lost",
      `<span class="topbar__chip"><span>Entity</span> ${currentEntity().name}</span><span class="topbar__chip"><span>Total</span> ${D.fmtCompact(total, ccy)}</span><span class="topbar__chip"><span>Items</span> ${list.length}</span>`,
      `<button class="btn btn--primary" id="run-aging">Run aging escalation</button>`);

    const rows = list.slice().sort((a, b) => b.ageDays - a.ageDays).map((u) => `
      <tr>
        <td class="muted" style="white-space:nowrap">${u.date}</td>
        <td><div class="cell-main">${u.customer}</div><div class="cell-sub">${u.desc} · ${u.id}</div></td>
        <td class="num strong">${fmt(u.amount, ccy)}</td>
        <td>${pill(u.ageDays + "d", u.tone)}</td>
        <td>${pill(u.reason, u.tone)}</td>
        <td class="t-right"><div class="row-actions">
          <button class="btn btn--primary btn--sm" onclick="location.hash='#/workspace'">Apply</button>
          <button class="btn btn--ghost btn--sm">Refund</button>
        </div></td>
      </tr>`).join("");

    content.innerHTML = `
      <div class="section">
        <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
          <div class="kpi kpi--warn"><div class="kpi__label">On-account total</div><div class="kpi__value">${D.fmtCompact(total, ccy)}</div></div>
          <div class="kpi kpi--neutral"><div class="kpi__label">Open items</div><div class="kpi__value">${list.length}</div></div>
          <div class="kpi kpi--info"><div class="kpi__label">Aged &gt; 30 days</div><div class="kpi__value">${list.filter((u) => u.ageDays > 30).length}</div></div>
          <div class="kpi kpi--good"><div class="kpi__label">Resolved this week</div><div class="kpi__value">38</div></div>
        </div>
      </div>
      <div class="section">
        <div class="card">
          <div class="card__head"><div class="card__title">On-account ledger — bank statement, oldest first</div><span class="muted" style="font-size:12px">${list.length} line items</span></div>
          <div class="card__body card__body--flush"><div class="table-wrap table-scroll"><table class="tbl tbl--fixed">
            <colgroup><col style="width:11%"><col style="width:34%"><col style="width:14%"><col style="width:9%"><col style="width:18%"><col style="width:14%"></colgroup>
            <thead><tr><th>Value date</th><th>Customer / description</th><th class="num">Amount</th><th>Age</th><th>Reason / exception type</th><th class="t-right">Action</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div></div>
        </div>
      </div>`;

    const ra = $("#run-aging");
    if (ra) ra.onclick = () => {
      const over30 = list.filter((u) => u.ageDays > 30).length, over90 = list.filter((u) => u.ageDays > 90).length;
      openModal("Aging escalation", `
        <div class="modal-sub">Escalate aged on-account cash to owners per policy.</div>
        <p style="margin:0">${over30} items aged &gt; 30 days will be escalated to the AR leads, and ${over90} items &gt; 90 days flagged for write-off review.</p>
        <div style="margin-top:18px;display:flex;justify-content:flex-end;gap:8px"><button class="btn btn--ghost" id="ra-cancel">Cancel</button><button class="btn btn--primary" id="ra-go">Run escalation</button></div>`);
      document.getElementById("ra-cancel").onclick = closeModal;
      document.getElementById("ra-go").onclick = () => { closeModal(); toast("Aging escalation run — owners notified"); };
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  DEDUCTIONS / CLAIMS
  // ════════════════════════════════════════════════════════════════════════
  function viewDeductions() {
    const ccy = D.dashboardFor(selectedEntityId).ccy;
    const ded = D.deductionsFor(selectedEntityId);
    const total = ded.reduce((s, d) => s + d.amount, 0);
    setTopbar("Deductions / claims", "Coded short-payments carried into the claims workflow",
      `<span class="topbar__chip"><span>Entity</span> ${currentEntity().name}</span><span class="topbar__chip"><span>Open value</span> ${D.fmtCompact(total, ccy)}</span><span class="topbar__chip"><span>Items</span> ${ded.length}</span>`,
      "");

    const rows = ded.map((d) => `
      <tr>
        <td class="cell-main">${d.id}</td>
        <td>${d.invoice}</td>
        <td>${d.customer}</td>
        <td class="num strong">${fmt(d.amount, ccy)}</td>
        <td>${d.reason} <span class="tag">${d.code}</span></td>
        <td>${pill(d.status, d.tone)}</td>
        <td class="muted">${d.owner}</td>
        <td class="t-right"><button class="btn btn--ghost btn--sm">Work claim</button></td>
      </tr>`).join("");

    content.innerHTML = `
      <div class="section">
        <div class="card">
          <div class="card__head"><div class="card__title">Open deductions &amp; claims</div><span class="muted" style="font-size:12px">from Partial / short &amp; deductions · ${ded.length} items</span></div>
          <div class="card__body card__body--flush"><div class="table-wrap table-scroll"><table class="tbl">
            <thead><tr><th>ID</th><th>Invoice</th><th>Customer</th><th class="num">Amount</th><th>Reason</th><th>Status</th><th>Owner</th><th class="t-right">Action</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div></div>
        </div>
      </div>`;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  CUSTOMERS 360
  // ════════════════════════════════════════════════════════════════════════
  let activeCustomerId = null, custTab = "open", custSearch = "";
  function viewCustomers() {
    const all = D.customersFor(selectedEntityId);
    const c = all.find((x) => x.id === activeCustomerId) || all[0];
    activeCustomerId = c.id;
    const ccy = c.ccy;
    setTopbar("Customers 360", "Aliases, open AR and the full SAP-style account view",
      `<span class="topbar__chip"><span>Entity</span> ${currentEntity().name}</span>`);

    const q = custSearch.toLowerCase();
    const list = all.filter((x) => x.name.toLowerCase().includes(q)).map((x) => `
      <div class="cmt-card" data-cid="${x.id}" style="${x.id === c.id ? "border-color:var(--border-primary-default);background:var(--surface-primary-subtle)" : ""}">
        <div class="cell-main">${x.name}</div>
        <div class="cell-sub">${x.country} · ${x.ccy} · ${x.terms}</div>
        <div class="cmt-card__foot"><span>Open AR ${D.fmtCompact(x.openAr, x.ccy)}</span></div>
      </div>`).join("") || emptyState("No customers found", `Nothing matches “${escapeAttr(custSearch)}”.`);

    const aliases = c.aliases.length ? c.aliases.map((a) => `
      <tr><td class="cell-main">${a.name}</td><td>${a.acct}</td><td>${pill(a.rel, "info")}</td></tr>`).join("")
      : `<tr><td colspan="3" class="muted">No aliases mapped.</td></tr>`;

    // SAP-style account line items. Open items = open invoices (debits) PLUS unapplied
    // receipts (credits on the account) — so the open total nets to Net AR.
    const openInvoiceRows = c.invoices.map((i) => ({ doc: i.inv, date: i.due, type: "Invoice", amount: i.open, status: "Open", tone: "warn" }));
    const unapCreditRows = (c.unapItems || []).map((u) => ({ doc: u.id, date: u.date, type: "Unapplied receipt · " + u.reason, amount: -u.amount, status: "Unapplied", tone: "info" }));
    const openItems = openInvoiceRows.concat(unapCreditRows);
    // Cleared (settled) items come in pairs — an invoice (debit) and the incoming payment
    // that cleared it (credit) — so the cleared balance always nets to zero.
    const clDates = ["2026-05-02", "2026-04-18", "2026-03-29", "2026-05-21", "2026-04-05", "2026-03-12"];
    const cleared = clDates.flatMap((d, j) => {
      const amt = Math.round(c.openAr * 0.12 * (1 + (j % 4)) / 4);
      const n = 6000 + j * 13 + c.id.length * 7;
      return [
        { doc: "INV-" + n, date: d, type: "Invoice", amount: amt, status: "Cleared", tone: "success" },
        { doc: "PMT-" + n, date: d, type: "Incoming payment", amount: -amt, status: "Cleared", tone: "success" },
      ];
    });
    // Pure unapplied breakdown (received amounts, positive) for the Unapplied tab.
    const unapRows = (c.unapItems || []).map((u) => ({ doc: u.id, date: u.date, type: "Receipt · " + u.reason, amount: u.amount, status: u.ageDays + "d aged", tone: u.tone || "warn" }));
    const netAr = c.openAr - c.unapplied;
    const items = custTab === "open" ? openItems : custTab === "cleared" ? cleared : custTab === "unapplied" ? unapRows : openInvoiceRows.concat(unapCreditRows, cleared);
    const totLabel = custTab === "unapplied" ? "Total unapplied" : custTab === "cleared" ? "Total cleared" : custTab === "all" ? "Total" : "Net AR";
    const itemRows = items.length ? items.map((i) => `
      <tr><td class="cell-main">${i.doc}</td><td class="muted">${i.date}</td><td>${i.type}</td><td class="num strong">${fmt(i.amount, ccy)}</td><td>${pill(i.status, i.tone)}</td></tr>`).join("")
      : `<tr><td colspan="5">${emptyState("No items", "Nothing to show in this view.")}</td></tr>`;

    content.innerHTML = `
      <div class="split">
        <div>
          <div class="card" style="margin-bottom:var(--scale-300)">
            <div class="card__body">
              <div class="section__head"><div class="section__title" style="font-size:20px">${c.name}</div>${pill(c.country, "neutral")}</div>
              <div class="kpis" style="grid-template-columns:repeat(4,1fr);margin-top:var(--scale-200)">
                <div class="kpi kpi--accent-primary"><div class="kpi__top"><div class="kpi__label">Open AR</div><button class="info-btn" data-info="Total receivable owed by this customer — the sum of their open invoices." aria-label="What is Open AR?">i</button></div><div class="kpi__value" style="font-size:22px" title="${fmt(c.openAr, ccy)}">${D.fmtCompact(c.openAr, ccy)}</div></div>
                <div class="kpi kpi--accent-brand"><div class="kpi__top"><div class="kpi__label">Unapplied</div><button class="info-btn" data-info="Cash received from this customer that hasn't yet been matched to an invoice — it sits as an open credit on the account until applied." aria-label="What is Unapplied?">i</button></div><div class="kpi__value" style="font-size:22px" title="${fmt(c.unapplied, ccy)}">${D.fmtCompact(c.unapplied, ccy)}</div></div>
                <div class="kpi kpi--accent-success"><div class="kpi__top"><div class="kpi__label">Net AR</div><button class="info-btn" data-info="Net receivable = Open AR − unapplied credits. What the customer effectively still owes once their unapplied cash on the account is offset." aria-label="What is Net AR?">i</button></div><div class="kpi__value" style="font-size:22px" title="${fmt(netAr, ccy)}">${D.fmtCompact(netAr, ccy)}</div></div>
                <div class="kpi kpi--accent-primary"><div class="kpi__top"><div class="kpi__label">ID rate</div><button class="info-btn" data-info="Identification rate — the share of this customer's incoming payments that Neoflo automatically attributed to them (matched to the payer), with no analyst touch." aria-label="What is ID rate?">i</button></div><div class="kpi__value" style="font-size:22px" title="${(c.idRate * 100).toFixed(1)}%">${Math.round(c.idRate * 100)}%</div></div>
              </div>
            </div>
          </div>

          <div class="card" style="margin-bottom:var(--scale-300)">
            <div class="card__head"><div class="card__title">Account line items (SAP view)</div>
              <div class="seg" id="cust-tab-seg">
                <button class="seg__btn ${custTab === "open" ? "on" : ""}" data-tab="open">Open items</button>
                <button class="seg__btn ${custTab === "unapplied" ? "on" : ""}" data-tab="unapplied">Unapplied (${(c.unapItems || []).length})</button>
                <button class="seg__btn ${custTab === "cleared" ? "on" : ""}" data-tab="cleared">Cleared</button>
                <button class="seg__btn ${custTab === "all" ? "on" : ""}" data-tab="all">All items</button>
              </div>
            </div>
            <div class="sap-totals">
              <span>Open AR <b>${fmt(c.openAr, ccy)}</b></span>
              <span>Unapplied credits <b>− ${fmt(c.unapplied, ccy)}</b></span>
              <span>Net AR <b>${fmt(netAr, ccy)}</b></span>
            </div>
            <div class="card__body card__body--flush"><div class="table-wrap"><table class="tbl">
              <thead><tr><th>Document</th><th>Posting date</th><th>Type</th><th class="num">Amount</th><th>Status</th></tr></thead>
              <tbody>${itemRows}${items.length ? `<tr class="modal-total"><td colspan="3" class="num">${totLabel}</td><td class="num strong">${fmt(items.reduce((s, i) => s + i.amount, 0), ccy)}</td><td></td></tr>` : ""}</tbody></table></div></div>
          </div>

          <div class="card">
            <div class="card__head"><div class="card__title">Payer aliases &amp; relationships</div></div>
            <div class="card__body card__body--flush"><div class="table-wrap"><table class="tbl">
              <thead><tr><th>Payer name / account</th><th>Bank a/c</th><th>Relationship</th></tr></thead>
              <tbody>${aliases}</tbody></table></div></div>
          </div>
        </div>

        <div class="card aside-card">
          <div class="card__head"><div class="card__title">Customers</div></div>
          <div class="card__body">
            <input id="cust-search" placeholder="Search customers…" value="${escapeAttr(custSearch)}" style="width:100%;padding:9px;border:1px solid var(--border-default-default);border-radius:var(--radius-sm);margin-bottom:10px;font-family:var(--font-family-inter);font-size:13px" />
            <div class="detail-list" id="cust-list">${list}</div>
          </div>
        </div>
      </div>`;

    content.querySelectorAll("#cust-list .cmt-card").forEach((el) => {
      el.onclick = () => { activeCustomerId = el.dataset.cid; viewCustomers(); };
    });
    content.querySelectorAll("#cust-tab-seg .seg__btn").forEach((b) => {
      b.onclick = () => { custTab = b.dataset.tab; viewCustomers(); };
    });
    content.querySelectorAll(".info-btn").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); showInfo(b, b.dataset.info); };
    });
    const cs = $("#cust-search");
    if (cs) cs.oninput = () => { custSearch = cs.value; const list2 = content.querySelector("#cust-list"); const matches = all.filter((x) => x.name.toLowerCase().includes(custSearch.toLowerCase())); list2.innerHTML = matches.length ? matches.map((x) => `<div class="cmt-card" data-cid="${x.id}" style="${x.id === c.id ? "border-color:var(--border-primary-default);background:var(--surface-primary-subtle)" : ""}"><div class="cell-main">${x.name}</div><div class="cell-sub">${x.country} · ${x.ccy} · ${x.terms}</div><div class="cmt-card__foot"><span>Open AR ${D.fmtCompact(x.openAr, x.ccy)}</span></div></div>`).join("") : `<div class="muted" style="font-size:13px;padding:8px">No customers match.</div>`; list2.querySelectorAll(".cmt-card").forEach((el) => { el.onclick = () => { activeCustomerId = el.dataset.cid; viewCustomers(); }; }); };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  APPLIED CASH
  // ════════════════════════════════════════════════════════════════════════
  let autoSearch = "", autoPeriod = "30", autoBank = "all", autoFrom = "", autoTo = "", autoSort = { key: "date", dir: -1 };
  const PERIODS = [{ v: "7", label: "Last 7 days" }, { v: "30", label: "Last 30 days" }, { v: "90", label: "Last 90 days" }, { v: "all", label: "All time" }, { v: "custom", label: "Custom range…" }];
  function viewAutoApplied() {
    const aa = D.autoAppliedFor(selectedEntityId), ccy = aa.ccy;
    setTopbar("Posted Collections", "Every receipt matched and posted to open invoices — searchable by period and bank account",
      `<span class="topbar__chip"><span>Entity</span> ${currentEntity().name}</span>`);

    const allDates = aa.list.map((x) => x.date).sort();
    const minDate = allDates[0], maxDate = allDates[allDates.length - 1];
    if (autoPeriod === "custom") { if (!autoFrom) autoFrom = minDate; if (!autoTo) autoTo = maxDate; }
    const inPeriod = (x) => autoPeriod === "custom" ? ((!autoFrom || x.date >= autoFrom) && (!autoTo || x.date <= autoTo))
      : autoPeriod === "all" ? true : x.ageDays <= +autoPeriod;

    const q = autoSearch.toLowerCase();
    const rows = aa.list.filter((x) =>
      inPeriod(x) &&
      (autoBank === "all" || x.bankId === autoBank) &&
      (!q || x.customer.toLowerCase().includes(q) || x.invoices.some((v) => v.inv.toLowerCase().includes(q)) || x.doc.includes(q)));
    // column sort
    const sortVal = (x) => { const k = autoSort.key; return k === "amount" ? x.amount : k === "customer" ? x.customer : k === "bank" ? x.bankName : k === "doc" ? x.doc : x.date; };
    rows.sort((a, b) => { const av = sortVal(a), bv = sortVal(b); return (av < bv ? -1 : av > bv ? 1 : 0) * autoSort.dir; });
    const sortInd = (k) => `<span class="sort-ind ${autoSort.key === k ? "on" : ""}">${autoSort.key === k ? (autoSort.dir < 0 ? "↓" : "↑") : "↕"}</span>`;
    // filter-aware KPIs
    const count = rows.length;
    const value = rows.reduce((s, x) => s + x.amount, 0);
    const avgConf = count ? rows.reduce((s, x) => s + x.conf, 0) / count : 0;
    const ttas = rows.map((x) => x.ttaMin).sort((a, b) => a - b);
    const medTtaMin = ttas.length ? ttas[Math.floor(ttas.length / 2)] : 0;
    const medTta = medTtaMin < 60 ? medTtaMin + " min" : (medTtaMin / 60).toFixed(1) + " hr";
    const periodLabel = autoPeriod === "custom" ? `${autoFrom} → ${autoTo}` : (PERIODS.find((p) => p.v === autoPeriod) || PERIODS[1]).label.toLowerCase();

    const body = rows.length ? rows.map((x, idx) => `
      <tr class="clickable" data-aid="${idx}">
        <td class="muted" style="white-space:nowrap">${x.date}</td>
        <td class="cell-sub" title="${escapeAttr(x.desc || "")}">${x.desc || "—"}</td>
        <td class="num strong">${fmt(x.amount, ccy)}</td>
        <td class="cell-main">${x.customer}</td>
        <td>${x.nInv > 1 ? `<span class="multi-inv">${x.invLabel}</span>` : x.invLabel}</td>
        <td class="muted">${x.bankName}</td>
        <td class="mono">${x.doc} <span class="row-chev">›</span></td>
      </tr>`).join("") : `<tr><td colspan="7">${emptyState("No posted collections in this view", "Try a wider period, another bank account, or clear the search.")}</td></tr>`;

    const bankOpts = `<option value="all" ${autoBank === "all" ? "selected" : ""}>All bank accounts (${aa.banks.length})</option>` +
      aa.banks.map((b) => `<option value="${b.id}" ${autoBank === b.id ? "selected" : ""}>${b.name}</option>`).join("");
    const periodOpts = PERIODS.map((p) => `<option value="${p.v}" ${autoPeriod === p.v ? "selected" : ""}>${p.label}</option>`).join("");
    const customFields = autoPeriod === "custom" ? `
          <label class="filter-field"><span>From</span><input type="date" id="aa-from" class="filter-sel" value="${autoFrom}" min="${minDate}" max="${maxDate}" /></label>
          <label class="filter-field"><span>To</span><input type="date" id="aa-to" class="filter-sel" value="${autoTo}" min="${minDate}" max="${maxDate}" /></label>` : "";

    content.innerHTML = `
      <div class="section">
        <div class="filter-bar">
          <label class="filter-field"><span>Period</span><select id="aa-period" class="filter-sel">${periodOpts}</select></label>
          ${customFields}
          <label class="filter-field"><span>Bank account</span><select id="aa-bank" class="filter-sel">${bankOpts}</select></label>
          <input id="aa-search" placeholder="Search customer / invoice / doc…" value="${escapeAttr(autoSearch)}" class="filter-search" />
        </div>
      </div>
      <div class="section">
        <div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));max-width:760px">
          <div class="kpi kpi--accent-success"><div class="kpi__label">Collections posted (${periodLabel})</div><div class="kpi__value">${count.toLocaleString("en-SG")}</div><div class="kpi__sub">receipts matched &amp; posted</div></div>
          <div class="kpi kpi--accent-primary"><div class="kpi__label">Value posted</div><div class="kpi__value">${D.fmtCompact(value, ccy)}</div><div class="kpi__sub">cleared to open invoices</div></div>
        </div>
      </div>
      <div class="section">
        <div class="card">
          <div class="card__head">
            <div class="card__title">Posted collections ledger</div>
            <span class="muted" style="margin-left:auto;font-size:12px">${count.toLocaleString("en-SG")} of ${aa.total.toLocaleString("en-SG")} this period</span>
          </div>
          <div class="card__body card__body--flush"><div class="table-wrap aa-scroll"><table class="tbl tbl--fixed">
            <colgroup><col style="width:11%"><col style="width:22%"><col style="width:12%"><col style="width:18%"><col style="width:11%"><col style="width:15%"><col style="width:11%"></colgroup>
            <thead><tr><th class="sortable" data-asort="date">Value date ${sortInd("date")}</th><th>Description</th><th class="num sortable" data-asort="amount">Amount ${sortInd("amount")}</th><th class="sortable" data-asort="customer">Customer ${sortInd("customer")}</th><th>Invoice</th><th class="sortable" data-asort="bank">Bank account ${sortInd("bank")}</th><th class="sortable" data-asort="doc">ERP doc ${sortInd("doc")}</th></tr></thead>
            <tbody>${body}</tbody>
          </table></div></div>
        </div>
      </div>`;

    const s = $("#aa-search");
    if (s) s.oninput = () => { autoSearch = s.value; viewAutoApplied(); };
    const ps = $("#aa-period");
    if (ps) ps.onchange = () => { autoPeriod = ps.value; if (autoPeriod !== "custom") { autoFrom = ""; autoTo = ""; } viewAutoApplied(); };
    const fromEl = $("#aa-from");
    if (fromEl) fromEl.onchange = () => { autoFrom = fromEl.value; viewAutoApplied(); };
    const toEl = $("#aa-to");
    if (toEl) toEl.onchange = () => { autoTo = toEl.value; viewAutoApplied(); };
    const bs = $("#aa-bank");
    if (bs) bs.onchange = () => { autoBank = bs.value; viewAutoApplied(); };
    content.querySelectorAll("th.sortable[data-asort]").forEach((th) => {
      th.onclick = () => {
        const k = th.dataset.asort;
        if (autoSort.key === k) autoSort.dir *= -1; else { autoSort.key = k; autoSort.dir = (k === "amount" || k === "date") ? -1 : 1; }
        viewAutoApplied();
      };
    });
    content.querySelectorAll("tr.clickable[data-aid]").forEach((tr) => {
      tr.onclick = () => appliedDetail(rows[+tr.dataset.aid], ccy);
    });
  }

  // Drill into one applied receipt — per-invoice allocation + posted journal entry.
  function appliedDetail(x, ccy) {
    if (!x) return;
    const num = (n) => n ? fmt(n, ccy) : "—";
    // per-invoice allocation (handles single AND multiple invoices)
    const allocRows = x.invoices.map((v) => `<tr>
      <td class="cell-main">${v.inv}</td>
      <td class="num">${fmt(v.gross, ccy)}</td>
      <td class="num">${num(v.wht)}</td>
      <td class="num">${num(v.discount)}</td>
      <td class="num">${num(v.bankCharge)}</td>
      <td class="num strong">${fmt(v.cash, ccy)}</td>
    </tr>`).join("");
    const allocTotal = `<tr class="modal-total"><td>Total (${x.nInv} invoice${x.nInv > 1 ? "s" : ""})</td><td class="num">${fmt(x.gross, ccy)}</td><td class="num">${num(x.wht)}</td><td class="num">${num(x.discount)}</td><td class="num">${num(x.bankCharge)}</td><td class="num strong">${fmt(x.amount, ccy)}</td></tr>`;
    // journal entry (balanced): Dr Bank + WHT + discount + bank charges = Cr AR (gross)
    const je = [["Bank (cash received)", x.amount, 0]];
    if (x.wht) je.push(["WHT receivable (asset)", x.wht, 0]);
    if (x.discount) je.push(["Cash discount allowed (expense)", x.discount, 0]);
    if (x.bankCharge) je.push(["Bank charges (expense)", x.bankCharge, 0]);
    je.push([`AR — ${x.customer} (invoice${x.nInv > 1 ? "s" : ""} cleared)`, 0, x.gross]);
    const jeBody = je.map((l) => `<tr><td class="mono">${glOf(l[0])}</td><td class="cell-main">${l[0]}</td><td class="num">${l[1] ? fmt(l[1], ccy) : ""}</td><td class="num">${l[2] ? fmt(l[2], ccy) : ""}</td></tr>`).join("");
    const totD = je.reduce((s, l) => s + l[1], 0), totC = je.reduce((s, l) => s + l[2], 0);
    openModal(`Posted collection — ${x.id}`, `
      <div class="post-ok">
        <div class="post-ok__badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></div>
        <div><div class="post-ok__title">${x.customer} · ${fmt(x.amount, ccy)}</div><div class="post-ok__sub">${pill(x.rule, x.tone)} <span class="conf-pill ${x.conf >= 0.85 ? "hi" : "mid"}" style="margin-left:6px">${Math.round(x.conf * 100)}% match</span> · cleared ${x.nInv} invoice${x.nInv > 1 ? "s" : ""}</div></div>
      </div>
      <div class="post-meta">
        <span>Bank account <b>${x.bankName}</b></span><span>Value date <b>${x.valueDate}</b></span><span>Clearing doc <b>${x.doc}</b></span>
      </div>
      <div class="modal-sub" style="margin-top:14px">Allocation — invoices cleared</div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Invoice</th><th class="num">Gross</th><th class="num">WHT</th><th class="num">Discount</th><th class="num">Bank chg</th><th class="num">Cash applied</th></tr></thead>
        <tbody>${allocRows}${x.nInv > 1 ? allocTotal : ""}</tbody>
      </table></div>
      <div class="modal-sub" style="margin-top:14px">Journal entry posted</div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>G/L</th><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
        <tbody>${jeBody}<tr class="modal-total"><td></td><td>Total</td><td class="num">${fmt(totD, ccy)}</td><td class="num">${fmt(totC, ccy)}</td></tr></tbody>
      </table></div>
      <div style="margin-top:18px;display:flex;justify-content:flex-end"><button class="btn btn--primary" id="ad-done">Done</button></div>`);
    const done = document.getElementById("ad-done"); if (done) done.onclick = closeModal;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  REPORTS
  // ════════════════════════════════════════════════════════════════════════
  function viewReports() {
    const db = D.dashboardFor(selectedEntityId), ccy = db.ccy;
    const custs = D.customersFor(selectedEntityId);
    const autoApply = parseInt(db.kpis[0].value), custId = parseInt(db.kpis[1].value);
    setTopbar("Reports & close", "Success metrics, trends and the close pack — all in " + ccy,
      `<span class="topbar__chip"><span>Entity</span> ${currentEntity().name}</span><span class="topbar__chip"><span>Processed till</span> <b>${D.lastStatementDate}</b></span>`,
      "");

    // derive 12-week trends from the entity seed so they tie to the KPIs
    const wk = (end, span) => Array.from({ length: 12 }, (_, i) => Math.round((end - span) + span * (i / 11)));
    const aaTrend = wk(autoApply, 14), idTrend = wk(custId, 8);
    const maxBy = Math.max(...db.byType.map((b) => b.count));
    const exBars = db.byType.map((b) => `
      <div class="barcol"><div class="barpair"><div class="bar bar--applied" style="height:${(b.count / maxBy) * 100}%" title="${b.count}"></div></div><div class="barlabel" style="font-size:9px">${b.label.split(" ")[0]}</div></div>`).join("");
    const maxAge = Math.max(...db.ageing.map((a) => a.amount));
    const ageBars = db.ageing.map((a) => `
      <div class="hbar"><span>${a.label}</span><div class="hbar__track"><div class="hbar__fill hbar__fill--age" style="width:${maxAge ? (a.amount / maxAge) * 100 : 0}%"></div></div><span class="hbar__val">${D.fmtCompact(a.amount, ccy)}</span></div>`).join("");
    const topCust = custs.slice().sort((a, b) => b.openAr - a.openAr).slice(0, 8).map((c) => `
      <tr><td class="cell-main">${c.name}</td><td class="num strong">${D.fmtCompact(c.openAr, ccy)}</td><td class="num">${D.fmtCompact(c.unapplied, ccy)}</td><td class="num">${Math.round(c.idRate * 100)}%</td></tr>`).join("");
    const metrics = [
      ["Auto-apply rate", autoApply + "%", "Cash applied with no human touch"],
      ["Customer identification", custId + "%", "Credits attributed to a customer"],
      ["Unapplied cash", D.fmtCompact(db.totalUnapplied, ccy), `${db.count} on-account items`],
      ["Open exceptions", String(db.count), "Across 4 exception types"],
      ["Median time to apply", "4.2 hrs", "Credit received → applied"],
      ["WHT recovered (QTD)", D.fmtCompact(Math.round(db.totalUnapplied * 0.12), ccy), "Cleared against certificates"],
    ];
    const metricRows = metrics.map((m) => `<div class="metric-row"><div><div class="cell-main">${m[0]}</div><div class="cell-sub">${m[2]}</div></div><div class="m-val">${m[1]}</div></div>`).join("");

    content.innerHTML = `
      <div class="section">
        <div class="kpis">
          ${metrics.slice(0, 4).map((m, i) => `<div class="kpi kpi--accent-${["success", "primary", "brand", "error"][i]}"><div class="kpi__label">${m[0]}</div><div class="kpi__value">${m[1]}</div><div class="kpi__sub">${m[2]}</div></div>`).join("")}
        </div>
      </div>

      <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
        <div class="card">
          <div class="card__head"><div class="card__title">Auto-apply rate — 12-week trend</div></div>
          <div class="card__body">${svgLine(aaTrend, "var(--surface-success-default)")}<p class="muted" style="margin-top:8px">Trending up as the model learns each analyst confirmation.</p></div>
        </div>
        <div class="card">
          <div class="card__head"><div class="card__title">Customer identification — 12-week trend</div></div>
          <div class="card__body">${svgLine(idTrend, "var(--surface-primary-default)")}<p class="muted" style="margin-top:8px">The O2C floor metric — share of credits attributed to a customer.</p></div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start;margin-top:var(--scale-300)">
        <div class="card">
          <div class="card__head"><div class="card__title">Open exceptions by type</div><span class="muted" style="font-size:12px">${db.count} total</span></div>
          <div class="card__body"><div class="barchart">${exBars}</div></div>
        </div>
        <div class="card">
          <div class="card__head"><div class="card__title">Unapplied cash ageing — ${D.fmtCompact(db.totalUnapplied, ccy)}</div></div>
          <div class="card__body"><div class="hbars hbars--age">${ageBars}</div></div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns:1.3fr 1fr;align-items:start;margin-top:var(--scale-300)">
        <div class="card">
          <div class="card__head"><div class="card__title">Top customers by open AR</div></div>
          <div class="card__body card__body--flush"><div class="table-wrap"><table class="tbl">
            <thead><tr><th>Customer</th><th class="num">Open AR</th><th class="num">Unapplied</th><th class="num">ID rate</th></tr></thead>
            <tbody>${topCust}</tbody>
          </table></div></div>
        </div>
        <div class="card">
          <div class="card__head"><div class="card__title">Success metrics &amp; close pack</div></div>
          <div class="card__body">${metricRows}</div>
        </div>
      </div>`;
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  let toastT;
  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t);
      Object.assign(t.style, { position: "fixed", bottom: "76px", left: "50%", transform: "translateX(-50%)",
        background: "var(--text-color-primary-black)", color: "#fff", padding: "10px 18px", borderRadius: "999px",
        fontSize: "13px", fontWeight: "600", zIndex: 1200, boxShadow: "var(--shadow-large)", fontFamily: "var(--font-family-plus-jakarta-sans)" });
    }
    t.textContent = msg; t.style.opacity = "1";
    clearTimeout(toastT); toastT = setTimeout(() => { t.style.opacity = "0"; }, 2200);
  }

  // ── Router ────────────────────────────────────────────────────────────────
  function router() {
    const hash = (location.hash || "#/dashboard").replace("#/", "");
    const route = routes.find((r) => r.id === hash) || routes[0];
    setActiveNav(route.id);
    route.render();
    content.classList.remove("view-in"); void content.offsetWidth; content.classList.add("view-in"); // smooth view transition
    window.scrollTo(0, 0);

  }

  // ── Sidebar org-context (entity label only — bank controls live in the topbar) ──
  function syncSidebarContext() {
    const sbEnt = $("#sb-entity"); if (sbEnt) sbEnt.textContent = currentEntity().name;
  }

  // ── Topbar bank-account controls (account switcher + add/manage + upload) ───
  function bankSelectChip() {
    const list = banksForEntity();
    if (!list.some((b) => b.id === selectedBankId)) selectedBankId = (list[0] || {}).id;
    return `<label class="topbar__chip topbar__chip--select"><span>Bank a/c</span>
      <select id="topbar-bank" aria-label="Bank account">
        ${list.map((b) => `<option value="${b.id}" ${b.id === selectedBankId ? "selected" : ""}>${b.name}</option>`).join("")}
        <option value="__manage">+ Add / manage accounts…</option>
      </select></label>`;
  }
  const uploadStmtAction = () => `<button class="btn btn--primary" id="tb-upload">${uploadIcon} Upload statement</button>`;
  function wireBankBar() {
    const sel = $("#topbar-bank");
    if (sel) sel.onchange = () => {
      if (sel.value === "__manage") { sel.value = selectedBankId || ""; openBankManager(); return; }
      selectedBankId = sel.value;
    };
    const up = $("#tb-upload");
    if (up) up.onclick = uploadStatement;
  }

  // Bank account management — add accounts per entity. Statements are brought in by
  // manual upload (no bank integration).
  function openBankManager() {
    const list = banksForEntity();
    const rows = list.length
      ? list.map((b) => `<tr><td class="cell-main">${b.name}</td><td>${b.type || "Current"}</td><td>${b.swift || "—"}</td><td>${pill("Manual upload", "primary")}</td></tr>`).join("")
      : `<tr><td colspan="4" class="muted">No bank accounts yet for this entity.</td></tr>`;
    const entCcy = currentEntity().currency;
    const ccyOpts = [entCcy, ...["SGD", "MYR", "IDR", "THB", "PHP", "USD", "EUR"].filter((c) => c !== entCcy)].map((c) => `<option value="${c}">${c}</option>`).join("");
    openModal(`Bank accounts — ${currentEntity().name}`, `
      <div class="modal-sub">Register the bank accounts for this entity. Statements are brought in by <b>manual upload</b> (MT940 / CSV / camt.053 / Excel) — no bank integration required.</div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Account</th><th>Type</th><th>SWIFT/BIC</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="bankform">
        <div class="bankform__title">Add a bank account</div>
        <div class="bankform__grid">
          <label class="bankfield"><span>Bank <i>*</i></span><input id="bk-bank" placeholder="e.g. UOB" /></label>
          <label class="bankfield"><span>Account nickname</span><input id="bk-nick" placeholder="e.g. Collections account" /></label>
          <label class="bankfield"><span>Account number <i>*</i></span><input id="bk-acct" placeholder="e.g. 451-002-3210" /></label>
          <label class="bankfield"><span>Currency <i>*</i></span><select id="bk-ccy">${ccyOpts}</select></label>
          <label class="bankfield"><span>SWIFT / BIC</span><input id="bk-swift" placeholder="e.g. UOVBSGSG" /></label>
          <label class="bankfield"><span>Account type</span><select id="bk-type"><option>Current</option><option>Collections</option><option>Escrow</option></select></label>
        </div>
        <div class="modal-sub" style="margin:10px 0 0">Once added, use <b>Upload statement</b> to bring in this account's statements (MT940 / CSV / camt.053 / Excel).</div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
          <button class="btn btn--ghost" id="bank-close">Close</button>
          <button class="btn btn--primary" id="bank-add">Add account</button>
        </div>
      </div>`);
    document.getElementById("bank-close").onclick = closeModal;
    document.getElementById("bank-add").onclick = () => {
      const $f = (id) => document.getElementById(id);
      const bank = $f("bk-bank").value.trim();
      const acct = $f("bk-acct").value.trim();
      const ccy = $f("bk-ccy").value;
      if (!bank) { $f("bk-bank").focus(); return; }
      if (!acct) { $f("bk-acct").focus(); return; }
      const last4 = (acct.replace(/\D/g, "").slice(-4) || acct.slice(-4));
      const nick = $f("bk-nick").value.trim();
      const name = `${bank} · …${last4} (${ccy})`;
      const id = "bk-" + Date.now();
      D.banks.push({ id, entity: selectedEntityId, name, nickname: nick, acctNo: acct, ccy, swift: $f("bk-swift").value.trim(), type: $f("bk-type").value, feed: "Manual upload" });
      selectedBankId = id;
      syncSidebarContext();
      openBankManager();
      toast(`Added ${name}`);
    };
  }

  // Manual bank-statement upload — the only ingestion path (no bank integration).
  function uploadStatement() {
    const list = banksForEntity();
    const opts = list.map((b) => `<option value="${b.id}" ${b.id === selectedBankId ? "selected" : ""}>${b.name}</option>`).join("") || `<option value="">No bank accounts — add one first</option>`;
    openModal("Upload bank statement", `
      <div class="modal-sub">Bring in a bank statement by manual upload — <b>MT940 · CSV · camt.053 · Excel</b>. Credits are parsed into the work queue for matching. No bank connection required.</div>
      <label class="filter-field" style="margin-bottom:12px"><span>Bank account</span><select id="us-bank" class="filter-sel" style="min-width:260px">${opts}</select></label>
      <div class="upload-drop" id="us-drop">
        <div class="upload-drop__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg></div>
        <div class="upload-drop__title">Choose a statement file or drag it here</div>
        <div class="muted" style="font-size:12px;margin-top:3px">MT940 · CSV · camt.053 · Excel · up to 20 MB</div>
        <span id="us-name" class="upload-drop__file"></span>
        <input type="file" id="us-file" accept=".mt940,.940,.txt,.csv,.xml,.sta,.camt,.xlsx,.xls" style="display:none">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
        <button class="btn btn--ghost" id="us-cancel">Cancel</button>
        <button class="btn btn--primary" id="us-import" disabled>Import statement</button>
      </div>`);
    const drop = document.getElementById("us-drop");
    const file = document.getElementById("us-file");
    const nameEl = document.getElementById("us-name");
    const importBtn = document.getElementById("us-import");
    const pick = () => { nameEl.textContent = file.files[0] ? "Selected: " + file.files[0].name : ""; importBtn.disabled = !file.files[0]; };
    drop.onclick = () => file.click();
    file.onchange = pick;
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("is-over"); };
    drop.ondragleave = () => drop.classList.remove("is-over");
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("is-over"); if (e.dataTransfer.files[0]) { file.files = e.dataTransfer.files; pick(); } };
    document.getElementById("us-cancel").onclick = closeModal;
    importBtn.onclick = () => {
      const bank = document.getElementById("us-bank");
      const bankName = bank.options[bank.selectedIndex] ? bank.options[bank.selectedIndex].text : "—";
      const n = 40 + (Math.abs((file.files[0] ? file.files[0].name.length : 7) * 17) % 80);   // illustrative parsed count
      closeModal();
      toast(`Statement imported to ${bankName} — ${n} credits parsed into the queue`);
    };
  }

  // ── Sidebar collapse + mobile drawer ───────────────────────────────────────
  function setupNavToggle() {
    const KEY = "neoflo_nav_collapsed";
    if (localStorage.getItem(KEY) === "1") document.body.classList.add("nav-collapsed");
    const toggle = $("#sidebar-toggle");
    if (toggle) {
      const sync = () => { toggle.title = document.body.classList.contains("nav-collapsed") ? "Expand menu" : "Collapse menu"; };
      sync();
      toggle.onclick = () => {
        const collapsed = document.body.classList.toggle("nav-collapsed");
        localStorage.setItem(KEY, collapsed ? "1" : "0");
        sync();

      };
    }
    const mob = $("#mobile-nav-btn");
    if (mob) mob.onclick = () => document.body.classList.toggle("nav-mobile-open");
    $("#sidebar-nav").addEventListener("click", (e) => {
      if (e.target.closest(".navlink")) document.body.classList.remove("nav-mobile-open");
    });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  buildNav();
  setupNavToggle();
  syncSidebarContext();
  window.addEventListener("hashchange", router);
  if (!location.hash) location.hash = "#/dashboard";
  router();

})();
