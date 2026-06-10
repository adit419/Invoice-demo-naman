/* ============================================================================
   Sample data for the Neoflo B2B Cash Application prototype.
   Illustrative figures only — modelled on the PRD (Grab / SEA context, SGD).
   ========================================================================== */
window.DATA = (function () {
  const fmt = (n, ccy = "SGD") =>
    ccy + " " + n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Org context: entities (currency derives from entity), banks, statement ─
  const entities = [
    { id: "grabads-sg", name: "Grab Ads SG",          country: "Singapore",   currency: "SGD" },
    { id: "gfb-my",     name: "GrabForBusiness MY",   country: "Malaysia",    currency: "MYR" },
    { id: "grabmart-id",name: "Grab Mart ID",         country: "Indonesia",   currency: "IDR" },
    { id: "grab-th",    name: "Grab Enterprise TH",   country: "Thailand",    currency: "THB" },
    { id: "grab-ph",    name: "Grab Ads PH",          country: "Philippines", currency: "PHP" },
  ];
  const banks = [
    { id: "dbs-sgd",   entity: "grabads-sg",  name: "DBS · …450 (SGD)",      feed: "Manual upload" },
    { id: "ocbc-sgd",  entity: "grabads-sg",  name: "OCBC · …881 (SGD)",     feed: "Manual upload" },
    { id: "maybank",   entity: "gfb-my",      name: "Maybank · …207 (MYR)",  feed: "Manual upload" },
    { id: "cimb-my",   entity: "gfb-my",      name: "CIMB · …540 (MYR)",     feed: "Manual upload" },
    { id: "bca-idr",   entity: "grabmart-id", name: "BCA · …119 (IDR)",      feed: "Manual upload" },
    { id: "mandiri-id",entity: "grabmart-id", name: "Mandiri · …772 (IDR)",  feed: "Manual upload" },
    { id: "scb-thb",   entity: "grab-th",     name: "SCB · …663 (THB)",      feed: "Manual upload" },
    { id: "kbank-thb", entity: "grab-th",     name: "KBank · …318 (THB)",    feed: "Manual upload" },
    { id: "bdo-php",   entity: "grab-ph",     name: "BDO · …884 (PHP)",      feed: "Manual upload" },
    { id: "bpi-php",   entity: "grab-ph",     name: "BPI · …205 (PHP)",      feed: "Manual upload" },
  ];
  const lastStatementDate = "08 Jun 2026";

  // ── Entity-driven, internally-consistent dashboard data (O2C) ─────────────
  // One generator builds the open exceptions = unapplied line items for an
  // entity; every aggregate (exceptions-by-type, ageing, totals, KPIs) is
  // DERIVED from that single list, so all numbers always tie out. Amounts are
  // produced in the entity's own currency.
  const CCY_SCALE = { SGD: 1, MYR: 3.1, THB: 25, PHP: 42, IDR: 11000 };
  const REASONS = ["Unidentified customer", "Partial / short & deductions", "Overpayment", "WHT certificate pending"];
  const REASON_TONE = { "Unidentified customer": "error", "Partial / short & deductions": "warn", "Overpayment": "neutral", "WHT certificate pending": "info" };

  // Country-appropriate SEA customer pools (used per entity so names always match
  // the entity's country). Add freely — every tab derives from these.
  const CUSTOMERS_BY_COUNTRY = {
    Singapore:   ["Lazada Singapore", "Sea Group Pte Ltd", "Shopee Pay SG", "FairPrice Group", "Sentosa Media Pte Ltd", "Razer Merchant Services", "Sheng Siong Pte Ltd", "Challenger Technologies", "Love Bonito Pte Ltd", "Charles & Keith SG", "Secretlab SG", "Ninja Van SG"],
    Malaysia:    ["AirAsia Digital Sdn Bhd", "Mr DIY Trading Sdn Bhd", "Maxis Berhad", "Petronas Dagangan", "Hong Leong Retail", "Padini Holdings Bhd", "ZUS Coffee Sdn Bhd", "Lazada Malaysia", "Maju Jaya Sdn Bhd", "Senheng Electric", "Watsons Malaysia", "PappaRich Group"],
    Indonesia:   ["Tokopedia Niaga", "Bukalapak Enterprise", "Gojek Indonesia", "BliBli Commerce", "Sinar Jaya Retail", "Sumber Alfaria Trijaya", "Indomaret Group", "Traveloka Indonesia", "Kopi Kenangan", "Erajaya Swasembada", "Matahari Dept Store", "Wings Surya"],
    Thailand:    ["Central Group TH", "PTT Oil & Retail", "CP All Pcl", "Lazada Thailand", "Bangchak Retail", "ThaiBev Distribution", "Robinson Dept Store", "Makro Pcl", "LINE MAN Wongnai", "Major Cineplex", "Boots Retail TH", "Singha Corporation"],
    Philippines: ["Zalora Philippines", "Jollibee Foods Corp", "SM Retail Inc", "PLDT Enterprise", "Globe Telecom", "Puregold Price Club", "Mercury Drug Corp", "GCash Merchant", "Shopee Philippines", "Ayala Malls", "Robinsons Retail", "Penshoppe Inc"],
  };
  const poolFor = (ent) => CUSTOMERS_BY_COUNTRY[ent.country] || CUSTOMERS_BY_COUNTRY.Singapore;
  const RELATIONSHIPS = ["Parent / treasury", "Trading as", "Group treasury", "Factor", "Subsidiary"];
  const CHANNELS = ["MEPS IBG TT", "INWARD TT", "INWARD TT FCY", "FAST GIRO COLLECTION", "GIRO BULK CR", "DUITNOW TRANSFER", "PROMPTPAY QR", "CHEQUE DEPOSIT"];

  function fmtCompact(n, ccy = "SGD") {
    const a = Math.abs(n); let v, s;
    if (a >= 1e9) { v = n / 1e9; s = "B"; } else if (a >= 1e6) { v = n / 1e6; s = "M"; } else if (a >= 1e3) { v = n / 1e3; s = "k"; } else return ccy + " " + Math.round(n);
    return ccy + " " + v.toFixed(2).replace(/\.?0+$/, "") + s;
  }
  function dateMinus(days) {
    const base = new Date("2026-06-08T00:00:00Z");
    base.setUTCDate(base.getUTCDate() - days);
    return base.toISOString().slice(0, 10);
  }
  const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  function stmtDate(iso) { const p = iso.split("-"); return p[2] + MON[(+p[1]) - 1] + p[0].slice(2); } // 08JUN26
  // A stable payer reference that recurs on EVERY remittance from a given customer —
  // their sender account/alias code. The identification reasoning cites this exact token.
  function payerKey(name) {
    const init = name.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 4);
    let h = 0; for (let k = 0; k < name.length; k++) h = (h * 31 + name.charCodeAt(k)) % 90000;
    return init + (10000 + h);
  }
  // A realistic bank-statement narration, varied by channel (MT940 style). For an
  // identified payer it carries the recurring sender-account token (/ACC <payerKey>).
  function narrate(channel, customer, ref, iso) {
    const d = stmtDate(iso);
    const unident = customer === "— unidentified —";
    const payer = unident ? "OBO PAYMENT NO BNF REF" : customer.toUpperCase();
    const pk = unident ? "" : payerKey(customer);
    const acc = pk ? ` /ACC ${pk}` : "";
    switch (channel) {
      case "INWARD TT": return `INWARD TT ${d} /ORG ${payer}${acc} /OUR ${ref}`;
      case "INWARD TT FCY": return `INWARD TT FCY ${d} /CHG OUR /ORG ${payer}${acc} /${ref}`;
      case "MEPS IBG TT": return `IBG GIRO ${d} ${payer}${pk ? " ACC " + pk : ""} ${ref}`;
      case "FAST GIRO COLLECTION": return `FAST ${d} ${payer}${pk ? " ACC " + pk : ""} OTHR ${ref}`;
      case "GIRO BULK CR": return `GIRO BULK CR ${d} ${payer}${pk ? " " + pk : ""} ${ref}`;
      case "DUITNOW TRANSFER": return `DUITNOW ${d} ${payer}${pk ? " " + pk : ""} REF${ref}`;
      case "PROMPTPAY QR": return `PROMPTPAY ${d} ${payer}${pk ? " " + pk : ""} ${ref}`;
      default: return `CHQ DEP ${d} ${payer}${pk ? " " + pk : ""} ${ref}`;
    }
  }
  // Skewed-but-deterministic reason so the split looks real (not 4 equal buckets)
  function reasonFor(i, seed) {
    const r = (i * 37 + seed * 13) % 100;
    if (r < 22) return "Unidentified customer";
    if (r < 55) return "Partial / short & deductions";
    if (r < 80) return "Overpayment";
    return "WHT certificate pending";
  }
  function ageBucket(d) {
    if (d <= 15) return "0–15 days"; if (d <= 30) return "15–30 days";
    if (d <= 90) return "1–3 months"; if (d <= 180) return "3–6 months"; return "6 months+";
  }
  const AGE_ORDER = ["0–15 days", "15–30 days", "1–3 months", "3–6 months", "6 months+"];

  const _cache = {};
  function dashboardFor(entityId) {
    if (_cache[entityId]) return _cache[entityId];
    const ent = entities.find((e) => e.id === entityId) || entities[0];
    const ccy = ent.currency, scale = CCY_SCALE[ccy] || 1;
    const pool = poolFor(ent);
    const seed = (entityId.length * 7 + ccy.charCodeAt(0) + ccy.charCodeAt(1)) % 97;
    const N = 170 + (seed % 150);   // varies per entity (170–319), not the same everywhere
    const list = [];
    for (let i = 0; i < N; i++) {
      const reason = reasonFor(i, seed);
      // Spread receipts across ALL customers (an LCG hash, not i*3 which only hit 4 of
      // them) with natural variation, so every Customer-360 record ties to real dashboard
      // line items instead of showing 0 unapplied.
      const customer = reason === "Unidentified customer" ? "— unidentified —" : pool[((i * 1103515245 + seed * 12345) >>> 0) % pool.length];
      const channel = CHANNELS[(i + seed) % CHANNELS.length];
      const ageDays = (i * 13 + seed * 3) % 230;
      const baseUnits = 700 + ((i * 97 + seed * 53) % 9300);     // 700–10000 base
      const amount = Math.round(baseUnits * scale);
      const date = dateMinus(ageDays);
      const ref = (reason === "WHT certificate pending" ? "WHT" : "") + (100000 + ((i * 31 + seed) % 899999));
      list.push({
        id: "UC-" + (3200 - i),
        date, channel,
        desc: narrate(channel, customer, ref, date),
        customer, amount, ageDays, reason, tone: REASON_TONE[reason],
      });
    }
    const byType = REASONS.map((rn) => {
      const sub = list.filter((x) => x.reason === rn);
      return { label: rn, count: sub.length, amount: sub.reduce((s, x) => s + x.amount, 0), tone: REASON_TONE[rn] };
    });
    const ageing = AGE_ORDER.map((lbl) => {
      const sub = list.filter((x) => ageBucket(x.ageDays) === lbl);
      return { label: lbl, amount: sub.reduce((s, x) => s + x.amount, 0), count: sub.length };
    });
    const totalUnapplied = list.reduce((s, x) => s + x.amount, 0);
    const autoApply = 72 + (seed % 16);   // 72–87 %
    const custId = 90 + (seed % 9);       // 90–98 %
    const amtOver30 = list.filter((x) => x.ageDays > 30).reduce((s, x) => s + x.amount, 0);
    const autoApplyDelta = 3 + (seed % 7), idDelta = 1 + (seed % 5);
    const kpis = [
      { key: "autoApply",  label: "Auto-apply rate",         value: autoApply + "%", exact: autoApply + "%", tone: "good", accent: "success", delta: "▲ " + autoApplyDelta + " pts QoQ", deltaTone: "up",
        sub: "Quarter to date · " + lastStatementDate, info: "The share of incoming cash Neoflo matched to invoices and posted automatically this quarter — with no analyst touch." },
      { key: "custId",     label: "Customer identification", value: custId + "%",   exact: custId + "%", tone: "good", accent: "primary", delta: "▲ " + idDelta + " pts QoQ", deltaTone: "up",
        sub: "Quarter to date · " + lastStatementDate, info: "The share of incoming payments Neoflo attributed to a customer. Identifying the payer is the first step before cash can be applied." },
      { key: "unapplied",  label: "Unapplied cash",          value: fmtCompact(totalUnapplied, ccy), exact: fmt(totalUnapplied, ccy), tone: "warn", accent: "brand", delta: "▼ 4% QoQ", deltaTone: "up", drill: "unapplied",
        sub: `${N} on-account · ${fmtCompact(amtOver30, ccy)} aged > 30d`, info: "Cash received and identified to a customer but not yet matched to invoices — it sits on-account until applied. Click for the line-by-line breakdown." },
      { key: "exceptions", label: "Open exceptions",         value: String(N), exact: N + " exceptions", tone: "warn", accent: "error", delta: "▼ " + (4 + seed % 9) + " QoQ", deltaTone: "up", drill: "exceptions",
        sub: "Open · needs analyst action", info: "Payments Neoflo couldn't auto-apply — these need an analyst to review and classify. Click for the breakdown by exception type." },
    ];
    const res = { ent, ccy, count: N, list, byType, ageing, totalUnapplied, kpis };
    _cache[entityId] = res;
    return res;
  }

  // Build a workspace cockpit (invoices + gap + remittance) for a credit line so
  // the Apply-cash screen uses the SAME data as the dashboard — amounts tie out.
  function buildCockpit(it, ccy, entityId) {
    if (it.reason === "Unidentified customer") {
      // No deterministic match — but Neoflo AI proposes a likely payer (fuzzy name +
      // amount/timing fingerprint) at sub-threshold confidence for the analyst to verify.
      const ent = entities.find((e) => e.id === entityId) || entities[0];
      const pool = poolFor(ent);
      const aiCustomer = {
        name: pool[Math.abs(it.amount * 7 + 13) % pool.length],
        confidence: Math.round((0.55 + (Math.abs(it.amount) % 24) / 100) * 100) / 100,   // 0.55–0.78
        how: "fuzzy match on payer name in the bank narration + amount / timing fingerprint (ID-5 / ID-6)",
      };
      return { customer: null, aiCustomer, invoices: [], remittance: { listed: 0, parsed: 0 }, aiConf: aiCustomer.confidence, sla: "OVERDUE",
        gap: { wht: 0, discount: 0, bankCharge: 0, onAccount: 0, rebate: 0, aiKind: null, aiRate: 0, unexplained: it.amount, note: "No customer auto-resolved — verify Neoflo AI's suggested match below, or pick another.", allocRule: "—" } };
    }
    const pk = payerKey(it.customer);
    const cust = { name: it.customer, id: "C-auto", confidence: 0.72 + ((it.amount % 26) / 100), how: `recurring sender account ${pk} in the narration + payer-name match (ID-3 / ID-4) — ${pk} is seen on every ${it.customer} remittance` };
    const sc = CCY_SCALE[ccy] || 1;
    // Decide the realistic gap "story" so any AI-suggested value is exact and sensible:
    // WHT 5%, cash discount 2%, a flat cross-border bank charge, a ~6% volume rebate,
    // or an overpayment to park on-account. The gap is left UNEXPLAINED so Neoflo AI can
    // propose the classification and the analyst validates it.
    let invTotal, aiKind, aiRate = 0, aiFlat = 0;
    if (it.reason === "WHT certificate pending") { invTotal = Math.round(it.amount / 0.95); aiKind = "wht"; aiRate = 0.05; }
    else if (it.reason === "Overpayment") { invTotal = Math.round(it.amount * 0.85); aiKind = "onaccount"; }
    else { // Partial / short & deductions — rotate through realistic causes
      const subg = Math.abs(it.amount) % 3;
      if (subg === 0) { aiFlat = Math.round((15 + (Math.abs(it.amount) % 40)) * sc); invTotal = it.amount + aiFlat; aiKind = "bankcharge"; }
      else if (subg === 1) { invTotal = Math.round(it.amount / 0.98); aiKind = "discount"; aiRate = 0.02; }
      else { invTotal = Math.round(it.amount / 0.94); aiKind = "rebate"; aiRate = 0.06; }
    }
    const cnt = 1 + (Math.abs(it.amount) % 3);
    const invs = []; let rem = invTotal;
    for (let j = 0; j < cnt; j++) { const open = j === cnt - 1 ? rem : Math.round(invTotal / cnt); rem -= open; invs.push({ inv: "INV-" + (7000 + (Math.abs(it.amount) % 900) + j), due: dateMinus(-(j * 7 + 3)), open, apply: open, wht: 0, discount: 0, sel: true }); }
    const gap = { bankCharge: 0, onAccount: 0, rebate: 0, aiKind, aiRate, note: "" };
    const diff = invTotal - it.amount;   // > 0 short, < 0 overpay
    gap.note = aiKind === "onaccount"
      ? `Cash exceeds the open invoices by ${fmt(-diff, ccy)} — an overpayment to park on-account.`
      : `Cash received is ${fmt(diff, ccy)} short of the invoices — classify the gap (Neoflo AI has a suggestion).`;
    // a few more of the customer's open invoices the analyst can add to the allocation
    const available = [0, 1, 2, 3].map((j) => ({ inv: "INV-" + (8200 + (Math.abs(it.amount) % 700) + j * 11), due: dateMinus(-(j * 9 + 6)), open: Math.round((900 + ((Math.abs(it.amount) / sc * (j + 2)) % 6000)) * sc), apply: 0, wht: 0, discount: 0, sel: false }));
    return { customer: cust, invoices: invs, available, remittance: { listed: invs.length, parsed: 0.82 + ((Math.abs(it.amount) % 15) / 100) }, aiConf: cust.confidence, sla: (3 + (Math.abs(it.amount) % 9)) + ":" + ("0" + (Math.abs(it.amount) % 60)).slice(-2) + ":00", gap };
  }

  // Once the analyst identifies the payer on a previously-unidentified credit, the
  // engine pulls that customer's open AR and proposes an allocation against the
  // receipt (subset-sum) — exactly as it would have done automatically had the
  // customer been recognised. Returns a matching proposed set + a few extra open
  // invoices the analyst can add. The proposal ties to the receipt so it balances.
  function fetchOpenInvoices(amount, ccy, custName) {
    const sc = CCY_SCALE[ccy] || 1;
    // Seed everything on the customer so a different payer returns genuinely different
    // invoices (numbers, dates, split) — not the same set for every customer.
    const cs = custName ? [].reduce.call(custName, (a, ch) => a + ch.charCodeAt(0), 0) : 0;
    const cnt = 1 + ((Math.abs(amount) + cs) % 3);          // 1–3 invoices that match the credit
    const invs = []; let rem = amount;
    for (let j = 0; j < cnt; j++) {
      const open = j === cnt - 1 ? rem : Math.round(amount / cnt); rem -= open;
      invs.push({ inv: "INV-" + (6100 + (cs % 800) + j), due: dateMinus(-(((cs + j * 5) % 22) + 4)), open, apply: open, wht: 0, discount: 0, sel: true });
    }
    const available = [0, 1, 2, 3].map((j) => ({ inv: "INV-" + (8600 + (cs % 600) + j * 7), due: dateMinus(-(((cs * 3 + j * 9) % 40) + 6)), open: Math.round((800 + (((cs + Math.abs(amount)) / sc * (j + 2)) % 5000)) * sc), apply: 0, wht: 0, discount: 0, sel: false }));
    return { invoices: invs, available };
  }

  // All customers for an entity (country pool) — for the change-customer picker
  function customersPoolFor(entityId) {
    const ent = entities.find((e) => e.id === entityId) || entities[0];
    return poolFor(ent);
  }

  // Customer 360 records, derived from the entity's line items so figures tie out
  const _custCache = {};
  function customersFor(entityId) {
    if (_custCache[entityId]) return _custCache[entityId];
    const db = dashboardFor(entityId), ccy = db.ccy, ent = db.ent, pool = poolFor(ent);
    const byCust = {};
    db.list.forEach((x) => { if (x.customer !== "— unidentified —") (byCust[x.customer] = byCust[x.customer] || []).push(x); });
    const scale = CCY_SCALE[ccy] || 1;
    const out = pool.map((name, idx) => {
      const items = byCust[name] || [];
      // Unapplied = this customer's own unapplied credits from the bank statement → ties to the dashboard.
      const unapplied = items.reduce((s, x) => s + x.amount, 0);
      // Open invoices form an ageing ladder; Open AR is EXACTLY their sum → ties to the SAP table on the page.
      // AR comfortably exceeds the unapplied credit sitting on the account (the realistic relationship).
      const invCount = 3 + (idx % 4);                                       // 3–6 open invoices
      const baseAr = 40000 + ((idx * 137 + 311) % 260000);                  // distinct per customer (40k–300k)
      const targetAr = Math.round(unapplied * (3 + (idx % 4)) + baseAr * scale);
      const weights = Array.from({ length: invCount }, (_, j) => 0.6 + ((idx * 3 + j * 7) % 9) / 10);
      const wsum = weights.reduce((a, b) => a + b, 0);
      let acc = 0;
      const invoices = weights.map((w, j) => {
        const open = j === invCount - 1 ? targetAr - acc : Math.round(targetAr * w / wsum);
        acc += open;
        const ageOffset = (idx + j) % 2 ? -(j * 12 + 6) : (j * 14 + 9);     // mix of overdue & upcoming
        return { inv: "INV-" + (7000 + idx * 10 + j), due: dateMinus(ageOffset), open };
      });
      const openAr = invoices.reduce((s, i) => s + i.open, 0);              // = targetAr, ties to the table
      const idRate = 0.86 + ((idx * 7) % 13) / 100;                         // 86–98 %
      const terms = ["Net 30", "Net 45", "Net 60"][idx % 3];
      const aliases = idx % 3 === 0 ? [{ name: name.split(" ")[0] + " Treasury", acct: "OCBC …" + (200 + idx), rel: RELATIONSHIPS[idx % RELATIONSHIPS.length] }] : [];
      const fingerprints = [{ pattern: "/ACC " + payerKey(name) + " · " + name.toUpperCase().slice(0, 8) + "*", weight: 0.6 + ((idx * 5) % 35) / 100, lastSeen: dateMinus((idx * 9) % 60) }];
      // The actual unapplied receipts that make up the Unapplied figure — same line
      // items shown on the dashboard, so the customer's breakdown ties out.
      const unapItems = items.slice().sort((a, b) => b.ageDays - a.ageDays).map((x) => ({ date: x.date, desc: x.desc, id: x.id, amount: x.amount, ageDays: x.ageDays, reason: x.reason, tone: x.tone }));
      return { id: "C-" + (1000 + idx), name, country: ent.country, ccy, terms, openAr, unapplied, idRate, aliases, fingerprints, invoices, unapItems };
    });
    _custCache[entityId] = out;
    return out;
  }

  // Applied cash — receipts the engine matched & posted to invoices. The count ties to
  // the dashboard auto-apply rate so the numbers are consistent across the app. The FULL
  // list is generated (spread over ~90 days, each tagged with the receiving bank account)
  // so the page can filter by period and by bank, and show every line.
  const _autoCache = {};
  const AUTO_RULES = [
    { rule: "Exact match", tone: "success" },
    { rule: "Remittance-linked", tone: "primary" },
    { rule: "In-narration invoice ref", tone: "primary" },
    { rule: "Payer alias + amount", tone: "info" },
    { rule: "Subset-sum match", tone: "info" },
  ];
  function autoAppliedFor(entityId) {
    if (_autoCache[entityId]) return _autoCache[entityId];
    const db = dashboardFor(entityId), ccy = db.ccy, ent = db.ent, pool = poolFor(ent), scale = CCY_SCALE[ccy] || 1;
    const seed = (entityId.length * 7 + ccy.charCodeAt(0) + ccy.charCodeAt(1)) % 97;
    const autoApply = 72 + (seed % 16);                                   // == dashboard auto-apply KPI
    const total = Math.round(db.count * autoApply / (100 - autoApply));   // applied count this period
    const entBanks = banks.filter((b) => b.entity === entityId);
    const list = [];
    for (let i = 0; i < total; i++) {
      const customer = pool[((i * 1103515245 + seed * 12345) >>> 0) % pool.length];
      const amount = Math.round((700 + ((i * 97 + seed * 53) % 9300)) * scale);
      const ageDays = (i * 13 + seed * 7) % 90;                           // spread across the quarter
      const date = dateMinus(ageDays);
      const r = AUTO_RULES[(i + seed) % AUTO_RULES.length];
      const conf = Math.round((0.95 + ((i * 7) % 5) / 100) * 100) / 100;  // 0.95–0.99
      const ttaMin = 1 + ((i * 17 + seed) % 58);                          // minutes from receipt → applied
      const bank = entBanks[(i + seed) % (entBanks.length || 1)] || { id: "", name: "—" };
      // A receipt may clear ONE or SEVERAL invoices. The cash is split across them; each
      // invoice's gross = its cash + any deduction the customer took on it (clean / WHT /
      // discount / bank charge, rotated per receipt). All sub-amounts tie to the totals.
      const nInv = (i % 5 === 0) ? 3 : (i % 3 === 0) ? 2 : 1;
      const dk = i % 4;
      const invoices = []; let remCash = amount;
      for (let k = 0; k < nInv; k++) {
        const cash = k === nInv - 1 ? remCash : Math.round(amount / nInv); remCash -= cash;
        let wht = 0, discount = 0, bankCharge = 0;
        if (dk === 1) wht = Math.round(cash * 5 / 95);
        else if (dk === 2) discount = Math.round(cash * 2 / 98);
        else if (dk === 3 && k === 0) bankCharge = Math.round((10 + (i % 30)) * scale);
        invoices.push({ inv: "INV-" + (5000 + ((i * 13 + seed + k * 137) % 4000)), cash, wht, discount, bankCharge, gross: cash + wht + discount + bankCharge });
      }
      const wht = invoices.reduce((s, v) => s + v.wht, 0);
      const discount = invoices.reduce((s, v) => s + v.discount, 0);
      const bankCharge = invoices.reduce((s, v) => s + v.bankCharge, 0);
      const gross = invoices.reduce((s, v) => s + v.gross, 0);
      const channel = CHANNELS[(i + seed) % CHANNELS.length];
      const ref = (10000 + ((i * 7 + seed) % 89999));
      list.push({
        id: "AA-" + (10000 + i), date, ageDays, customer, amount,
        desc: narrate(channel, customer, ref, date),
        invoices, nInv, invLabel: nInv === 1 ? invoices[0].inv : nInv + " invoices",
        rule: r.rule, tone: r.tone, conf, doc: "1900" + (4000 + ((i * 31 + seed) % 5999)),
        ttaMin, tta: ttaMin < 60 ? ttaMin + " min" : (ttaMin / 60).toFixed(1) + " hr",
        bankId: bank.id, bankName: bank.name, valueDate: date,
        wht, discount, bankCharge, gross,
      });
    }
    const res = { list, total, autoApply, ccy, banks: entBanks };
    _autoCache[entityId] = res;
    return res;
  }

  // Deductions / claims, drawn from the entity's Partial/short & deductions items
  function deductionsFor(entityId) {
    const db = dashboardFor(entityId);
    const items = db.list.filter((x) => x.reason === "Partial / short & deductions").slice(0, 40);
    const codes = [
      ["WHT-5", "Withholding tax", "Cert pending", "warn", "Tax desk"],
      ["SHRT", "Shortage claim", "Open", "error", "Claims — Priya"],
      ["PRC", "Pricing dispute", "Disputed", "error", "Claims — Wei"],
      ["RBT", "Rebate taken", "Approved", "success", "Claims — Priya"],
      ["DISC", "Ineligible discount", "Chasing", "warn", "AR — Sam"],
    ];
    return items.map((x, i) => {
      const c = codes[i % codes.length];
      return { id: "DD-" + (900 - i), invoice: "INV-" + (7000 + i), customer: x.customer === "— unidentified —" ? poolFor(db.ent)[i % poolFor(db.ent).length] : x.customer, amount: Math.max(50, Math.round(x.amount * 0.15)), reason: c[1], code: c[0], status: c[2], tone: c[3], owner: c[4] };
    });
  }

  // ── Dashboard ──────────────────────────────────────────────────────────
  // Each KPI carries a consistent secondary line: a directional quarter-on-quarter
  // trend ({arrow} {value} QoQ over the last 3 months), green when the movement is
  // an improvement. Tiles with a `drill` key are clickable and open a line-by-line
  // breakdown; `info` powers the (i) tooltip.
  const kpis = [
    { key: "autoApply",  label: "Auto-apply rate",     value: "78%",       tone: "good", delta: "▲ 6 pts QoQ", deltaTone: "up",
      info: "The share of incoming cash Neoflo matched to invoices and posted automatically this quarter — with no analyst touch." },
    { key: "idRate",     label: "Identification rate", value: "94%",       tone: "good", delta: "▲ 3 pts QoQ", deltaTone: "up",
      info: "The share of incoming payments Neoflo attributed to a customer. Identifying the payer is the first step before cash can be applied." },
    { key: "unapplied",  label: "Unapplied cash",      value: "SGD 1.24M", tone: "warn", delta: "▼ 4% QoQ",   deltaTone: "up", drill: "unapplied",
      info: "Cash received and identified to a customer but not yet matched to invoices — it sits on-account until applied. Click for the line-by-line breakdown." },
    { key: "exceptions", label: "Open exceptions",     value: "250",       tone: "warn", delta: "▼ 12 QoQ",   deltaTone: "up", drill: "exceptions",
      info: "Payments Neoflo couldn't auto-apply — these need an analyst to review and classify. Click for the breakdown by exception type." },
  ];

  // Line-by-line drill-downs behind clickable KPI tiles
  const breakdowns = {
    unapplied: {
      title: "Unapplied cash — line by line", total: "SGD 1.24M",
      columns: ["Bank account", "Value date", "Description", "Amount"], money: 3,
      rows: [
        ["DBS · …450",  "2026-05-02", "GIRO inflow — unidentified payer",        312000],
        ["DBS · …450",  "2026-05-03", "TT residual after allocation — Lazada SG", 188500],
        ["OCBC · …881", "2026-05-03", "Overpayment residual — Shopee Pay",        156000],
        ["DBS · …450",  "2026-04-28", "Advance — Sea Group (no open invoice)",    268000],
        ["DBS · …450",  "2026-05-01", "Subset-sum residual — Tokopedia Ads",      121500],
        ["OCBC · …881", "2026-04-19", "On-account — Sinar Jaya Retail",            94000],
        ["DBS · …450",  "2026-05-04", "Misdirected credit pending return",        100000],
      ],
    },
    exceptions: {
      title: "Open exceptions — by type", total: "250 exceptions",
      columns: ["Exception type", "Count"], money: -1,
      rows: [
        ["Unidentified customer", 74],
        ["Partial / short & deductions", 96],
        ["Overpayment", 45],
        ["WHT certificate pending", 35],
      ],
    },
  };

  const dailyChart = [
    { day: "Mon", applied: 92, unapplied: 24 },
    { day: "Tue", applied: 88, unapplied: 26 },
    { day: "Wed", applied: 80, unapplied: 22 },
    { day: "Thu", applied: 76, unapplied: 19 },
    { day: "Fri", applied: 70, unapplied: 16 },
    { day: "Sat", applied: 58, unapplied: 12 },
  ];

  const exceptionsByType = [
    { label: "Unidentified customer",        value: 74 },
    { label: "Partial / short & deductions", value: 96 },
    { label: "Overpayment",                  value: 45 },
    { label: "WHT certificate pending",      value: 35 },
  ];

  // Ageing of the SGD 1.24M unapplied cash (replaces the old daily bar chart)
  const ageingUnapplied = {
    title: "Unapplied cash ageing", total: "SGD 1.24M",
    buckets: [
      { label: "0–15 days",  amount: 512000 },
      { label: "15–30 days", amount: 326000 },
      { label: "1–3 months", amount: 248000 },
      { label: "3–6 months", amount: 102000 },
      { label: "6 months+",  amount: 52000  },
    ],
  };

  // ── Receipts queue (drives the workspace) ───────────────────────────────
  const receipts = [
    {
      id: "FT77A21B", amount: 48250.00, ccy: "SGD", valueDate: "2026-05-03", bankRef: "FT77A21B",
      narration: "MEPS IBG TT / SINARJAYA RETAIL / INV AX99 BATCH", bankAcct: "DBS …450",
      customer: { name: "Sinar Jaya Retail Pte Ltd", id: "C-1042", confidence: 0.91, how: "remittance + alias (ID-1/ID-4)" },
      remittance: { listed: 5, parsed: 0.88 },
      state: "Matched", stateTone: "primary", ageHrs: 6, sla: "06:12:40", aiConf: 0.91,
      invoices: [
        { inv: "INV-4471", due: "2026-05-02", open: 12000.00, apply: 12000.00, sel: true },
        { inv: "INV-4480", due: "2026-05-04", open: 9500.00,  apply: 9500.00,  sel: true },
        { inv: "INV-4495", due: "2026-05-06", open: 18000.00, apply: 18000.00, sel: true },
        { inv: "INV-4502", due: "2026-05-08", open: 9200.00,  apply: 8750.00,  sel: true },
        { inv: "INV-4510", due: "2026-05-10", open: 6400.00,  apply: 0,        sel: false },
      ],
      gap: { wht: -450.00, discount: 0, bankCharge: 0, unexplained: 0,
             note: "INV-4502 short by 450.00 → gap classified: WHT 5% (cert pending)", allocRule: "Remittance" },
    },
    {
      id: "FT88C04Z", amount: 126400.00, ccy: "SGD", valueDate: "2026-05-03", bankRef: "FT88C04Z",
      narration: "INWARD TT / ORD: LAZADA SG TREASURY / BNF: GRAB ADS / REF 99XQ", bankAcct: "DBS …450",
      customer: { name: "Lazada SG (treasury)", id: "C-1108", confidence: 0.62, how: "amount+timing fingerprint (ID-6) — confirm payer" },
      remittance: { listed: 0, parsed: 0 },
      state: "Identified", stateTone: "warn", ageHrs: 11, sla: "02:44:10", aiConf: 0.62,
      invoices: [
        { inv: "INV-4388", due: "2026-04-28", open: 40000.00, apply: 40000.00, sel: true },
        { inv: "INV-4401", due: "2026-04-30", open: 52000.00, apply: 52000.00, sel: true },
        { inv: "INV-4419", due: "2026-05-02", open: 31000.00, apply: 31000.00, sel: true },
        { inv: "INV-4444", due: "2026-05-05", open: 18500.00, apply: 0,        sel: false },
      ],
      gap: { wht: 0, discount: 0, bankCharge: 0, unexplained: 3400.00,
             note: "Subset-sum leaves 3,400.00 residual → park on-account or confirm extra invoice", allocRule: "Subset-sum" },
    },
    {
      id: "FT90D17K", amount: 9980.00, ccy: "SGD", valueDate: "2026-05-04", bankRef: "FT90D17K",
      narration: "INWARD TT FCY / USD 7,500.00 @ 1.331 / CHARGES OUR", bankAcct: "DBS …450",
      customer: { name: "Tokopedia Ads", id: "C-1190", confidence: 0.97, how: "in-narration invoice ref (ID-3)" },
      remittance: { listed: 1, parsed: 0.95 },
      state: "Matched", stateTone: "primary", ageHrs: 3, sla: "08:50:00", aiConf: 0.97,
      invoices: [
        { inv: "INV-4523", due: "2026-05-06", open: 10000.00, apply: 10000.00, sel: true },
      ],
      gap: { wht: 0, discount: 0, bankCharge: -20.00, unexplained: 0,
             note: "Short by 20.00 → bank charge in transit, within tolerance → auto-write-off", allocRule: "Exact" },
    },
    {
      id: "FT91E22M", amount: 5000.00, ccy: "SGD", valueDate: "2026-05-04", bankRef: "FT91E22M",
      narration: "FAST GIRO COLLECTION / BULK / NO REMITTANCE REF", bankAcct: "DBS …450",
      customer: null,
      remittance: { listed: 0, parsed: 0 },
      state: "Unidentified", stateTone: "error", ageHrs: 28, sla: "OVERDUE", aiConf: 0.0,
      invoices: [], gap: { wht: 0, discount: 0, bankCharge: 0, unexplained: 5000.00,
        note: "No customer resolved at any tier → suspense queue, suggest closest matches", allocRule: "—" },
    },
  ];

  // ── Unapplied / on-account (full work list) ─────────────────────────────
  const unapplied = [
    { id: "UC-2201", customer: "Sinar Jaya Retail Pte Ltd", amount: 3450.00,  ageDays: 41, source: "FT55X10A", reason: "Residual after allocation",  tone: "warn" },
    { id: "UC-2198", customer: "Lazada SG (treasury)",      amount: 3400.00,  ageDays: 2,  source: "FT88C04Z", reason: "Subset-sum residual",        tone: "neutral" },
    { id: "UC-2150", customer: "Sea Group Pte Ltd",         amount: 28000.00, ageDays: 63, source: "FT41J88P", reason: "Advance — no open invoice",   tone: "error" },
    { id: "UC-2099", customer: "Shopee Pay",                amount: 12750.00, ageDays: 9,  source: "FT60K22Q", reason: "Overpayment residual",        tone: "neutral" },
    { id: "UC-2044", customer: "Bukalapak Enterprise",      amount: 6200.00,  ageDays: 27, source: "FT38L09R", reason: "Identified, no clean match",  tone: "warn" },
    { id: "UC-2031", customer: "Tokopedia Ads",             amount: 9100.00,  ageDays: 5,  source: "FT62M11S", reason: "Remittance awaited",         tone: "neutral" },
    { id: "UC-2018", customer: "Grab Mart ID",              amount: 41200.00, ageDays: 78, source: "FT29N04T", reason: "Advance — no open invoice",   tone: "error" },
    { id: "UC-2007", customer: "Central Group TH",          amount: 18650.00, ageDays: 33, source: "FT70P22U", reason: "Identified, no clean match",  tone: "warn" },
    { id: "UC-1994", customer: "Maju Jaya Sdn Bhd",         amount: 5400.00,  ageDays: 12, source: "FT55Q08V", reason: "Overpayment residual",        tone: "neutral" },
    { id: "UC-1981", customer: "FairPrice Group",           amount: 22300.00, ageDays: 51, source: "FT41R77W", reason: "Residual after allocation",  tone: "error" },
    { id: "UC-1975", customer: "PTT Retail",                amount: 7850.00,  ageDays: 4,  source: "FT63S09X", reason: "Subset-sum residual",        tone: "neutral" },
    { id: "UC-1968", customer: "VNG Corporation",           amount: 14900.00, ageDays: 22, source: "FT38T44Y", reason: "Identified, no clean match",  tone: "warn" },
    { id: "UC-1950", customer: "Sinar Jaya Retail Pte Ltd", amount: 3100.00,  ageDays: 88, source: "FT22U10Z", reason: "Misdirected — pending return", tone: "error" },
  ];

  // ── Deductions / claims ─────────────────────────────────────────────────
  const deductions = [
    { id: "DD-771", invoice: "INV-4502", customer: "Sinar Jaya Retail Pte Ltd", amount: 450.00,  reason: "Withholding tax", code: "WHT-5", status: "Cert pending", tone: "warn",  owner: "Tax desk" },
    { id: "DD-769", invoice: "INV-4310", customer: "Sea Group Pte Ltd",    amount: 1200.00, reason: "Shortage claim",  code: "SHRT",  status: "Open",         tone: "error", owner: "Claims — Priya" },
    { id: "DD-765", invoice: "INV-4288", customer: "Shopee Pay",           amount: 800.00,  reason: "Pricing dispute", code: "PRC",   status: "Disputed",     tone: "error", owner: "Claims — Wei" },
    { id: "DD-760", invoice: "INV-4255", customer: "Tokopedia Ads",        amount: 300.00,  reason: "Rebate taken",    code: "RBT",   status: "Approved",     tone: "success", owner: "Claims — Priya" },
    { id: "DD-754", invoice: "INV-4199", customer: "Bukalapak Enterprise", amount: 520.00,  reason: "Ineligible discount", code: "DISC", status: "Chasing",   tone: "warn",  owner: "AR — Sam" },
  ];

  // ── Customers (360) ─────────────────────────────────────────────────────
  const customers = [
    {
      id: "C-1042", name: "Sinar Jaya Retail Pte Ltd", country: "Singapore", ccy: "SGD", terms: "Net 30",
      openAr: 55100.00, unapplied: 3450.00, idRate: 0.96,
      aliases: [
        { name: "Sinar Jaya Holdings Treasury", acct: "OCBC …881", rel: "Parent / treasury" },
        { name: "SINAR JAYA TA FRESHMART", acct: "DBS …210", rel: "Trading as" },
      ],
      fingerprints: [
        { pattern: "TT REF AX99*", weight: 0.88, lastSeen: "2026-05-03" },
        { pattern: "GIRO SINARJAYA*", weight: 0.71, lastSeen: "2026-04-19" },
      ],
      invoices: [
        { inv: "INV-4471", due: "2026-05-02", open: 12000.00 },
        { inv: "INV-4480", due: "2026-05-04", open: 9500.00 },
        { inv: "INV-4495", due: "2026-05-06", open: 18000.00 },
        { inv: "INV-4510", due: "2026-05-10", open: 6400.00 },
      ],
    },
    {
      id: "C-1108", name: "Lazada SG (treasury)", country: "Singapore", ccy: "SGD", terms: "Net 45",
      openAr: 141500.00, unapplied: 3400.00, idRate: 0.74,
      aliases: [{ name: "Lazada Group Treasury", acct: "Citi …334", rel: "Group treasury" }],
      fingerprints: [{ pattern: "INWARD TT /BNF GRAB /REF 99*", weight: 0.62, lastSeen: "2026-05-03" }],
      invoices: [
        { inv: "INV-4388", due: "2026-04-28", open: 40000.00 },
        { inv: "INV-4401", due: "2026-04-30", open: 52000.00 },
        { inv: "INV-4419", due: "2026-05-02", open: 31000.00 },
        { inv: "INV-4444", due: "2026-05-05", open: 18500.00 },
      ],
    },
    {
      id: "C-1190", name: "Tokopedia Ads", country: "Indonesia", ccy: "IDR", terms: "Net 30",
      openAr: 10000.00, unapplied: 0, idRate: 0.99,
      aliases: [], fingerprints: [{ pattern: "CROSS-BORDER WIRE*", weight: 0.95, lastSeen: "2026-05-04" }],
      invoices: [{ inv: "INV-4523", due: "2026-05-06", open: 10000.00 }],
    },
  ];

  // ── Reports / success metrics ───────────────────────────────────────────
  const reports = [
    { metric: "Auto-apply rate",      value: "78%",      note: "Share of cash applied with no human touch" },
    { metric: "Identification rate",  value: "94%",      note: "Share of credits attributed to a customer" },
    { metric: "Unapplied cash",       value: "SGD 1.24M",note: "Value held on-account / advance" },
    { metric: "Median time to apply", value: "4.2 hrs",  note: "Credit received → applied" },
    { metric: "Deduction resolution", value: "6.1 days", note: "Median cycle time of open claims" },
    { metric: "WHT recovered (MTD)",  value: "SGD 198k", note: "Cleared against certificates" },
    { metric: "Reversal / re-apply",  value: "1.3%",     note: "Proxy for mis-applications" },
  ];

  // ── Pipeline (reference strip on dashboard) ─────────────────────────────
  const pipeline = ["① Identify customer", "② Identify obligations", "③ Reconcile amount", "④ Apply & post", "⑤ Resolve residual"];

  return { fmt, fmtCompact, entities, banks, lastStatementDate, dashboardFor, buildCockpit, fetchOpenInvoices, customersFor, autoAppliedFor, deductionsFor, customersPoolFor, reports, pipeline };
})();
