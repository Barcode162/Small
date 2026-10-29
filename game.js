(() => {
  const previousKill = window.__velnKill;
  const live = { dead: false, raf: 0 };
  const controls = new AbortController();
  const bin = { observer: null, audio: null };
  const listen = (target, type, fn, options) => target.addEventListener(type, fn, { ...options, signal: controls.signal });
  window.__velnKill = () => {
    live.dead = true;
    cancelAnimationFrame(live.raf);
    bin.observer?.disconnect();
    try { bin.audio?.close(); } catch { /* already closed */ }
    controls.abort();
  };
  if (previousKill) previousKill();

  const $ = (id) => document.getElementById(id);
  const hit = $("hit");
  const view = $("view");
  if (!hit || !view) return;

  const ZERO = { m: 0, e: 0 };
  const norm = (m, e) => {
    if (!Number.isFinite(m) || !Number.isFinite(e) || m === 0) return ZERO;
    const sign = m < 0 ? -1 : 1;
    let am = Math.abs(m);
    if (am >= 10 || am < 1) {
      const shift = Math.floor(Math.log10(am));
      if (!Number.isFinite(shift)) return ZERO;
      am /= 10 ** shift;
      e += shift;
    }
    if (e > 1e9) return { m: sign * 9.999, e: 1e9 };
    if (e < -12) return ZERO;
    return { m: sign * am, e };
  };
  const big = (n) => {
    if (!Number.isFinite(n) || n === 0) return ZERO;
    const sign = n < 0 ? -1 : 1;
    const e = Math.floor(Math.log10(Math.abs(n)));
    return norm(sign * (Math.abs(n) / 10 ** e), e);
  };
  const fromLog = (log) => {
    if (!Number.isFinite(log) || log < -12) return ZERO;
    const e = Math.floor(log);
    return norm(10 ** (log - e), e);
  };
  const log10b = (a) => (a.m === 0 ? -Infinity : Math.log10(Math.abs(a.m)) + a.e);
  const add = (a, b) => {
    if (a.m === 0) return b.m === 0 ? ZERO : b;
    if (b.m === 0) return a;
    let hi = a;
    let lo = b;
    if (hi.e < lo.e) {
      hi = b;
      lo = a;
    }
    const diff = hi.e - lo.e;
    if (diff > 15) return hi;
    return norm(hi.m + lo.m / 10 ** diff, hi.e);
  };
  const mulN = (a, n) => (!a.m || !n || !Number.isFinite(n) ? ZERO : norm(a.m * n, a.e));
  const gte = (a, b) => {
    if (a.m === 0 && b.m === 0) return true;
    if (a.m >= 0 && b.m < 0) return true;
    if (a.m < 0 && b.m >= 0) return false;
    const neg = a.m < 0;
    if (a.e !== b.e) return (a.e > b.e) !== neg;
    return a.m >= b.m;
  };
  const mul = (a, b) => (!a.m || !b.m ? ZERO : norm(a.m * b.m, a.e + b.e));
  const div = (a, b) => (!a.m ? ZERO : !b.m ? { m: 9.999, e: 1e9 } : norm(a.m / b.m, a.e - b.e));
  const costOne = (base, growth, owned) =>
    owned <= 0 ? big(base) : fromLog(Math.log10(base) + owned * Math.log10(growth));
  const costBulk = (base, growth, owned, n) => {
    if (n <= 0) return ZERO;
    if (Math.abs(growth - 1) < 1e-9) return mulN(big(base), n);
    const first = costOne(base, growth, owned);
    const growN = fromLog(n * Math.log10(growth));
    const minusOne = add(growN, { m: -1, e: 0 });
    return div(mul(first, minusOne), big(growth - 1));
  };
  const maxBuy = (base, growth, owned, wallet) => {
    if (!gte(wallet, costOne(base, growth, owned))) return 0;
    let lo = 1;
    let hi = 1;
    while (hi < 1e6 && gte(wallet, costBulk(base, growth, owned, hi))) {
      lo = hi;
      hi *= 2;
    }
    hi = Math.min(hi, 1e6);
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (gte(wallet, costBulk(base, growth, owned, mid))) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const SUFFIX = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc", "Ud", "Dd", "Td", "Qad"];
  const trim = (v, d) => (d <= 0 ? String(Math.round(v)) : v.toFixed(d).replace(/\.?0+$/, ""));
  const format = (a) => {
    if (!a || a.m === 0 || !Number.isFinite(a.e)) return "0";
    const neg = a.m < 0;
    const e = a.e;
    const am = Math.abs(a.m);
    let body;
    if (e < 0) body = trim(am * 10 ** e, 2);
    else if (e < 3) {
      const v = am * 10 ** e;
      body = v >= 100 ? String(Math.round(v)) : trim(v, v >= 10 ? 1 : 2);
    } else if (e < SUFFIX.length * 3) {
      const tier = Math.floor(e / 3);
      const v = am * 10 ** (e % 3);
      body = trim(v, v >= 100 ? 0 : v >= 10 ? 1 : 2) + SUFFIX[tier];
    } else body = trim(am, 2) + "e" + e;
    return neg ? "-" + body : body;
  };

  const LOOPS = [
    ["flicker", "Flicker", "An auto-striker. Nervous, cheap, loyal.", 15, 1.15, 0.6],
    ["hammer", "Hammer", "Slow iron. Runs hot.", 130, 1.16, 4.2],
    ["cascade", "Cascade", "Sometimes the hit refuses to end.", 1400, 1.17, 32],
    ["kiln", "Kiln", "Buys heat. Heat buys the room.", 11000, 1.18, 180],
    ["rift", "Rift", "A door that pays when it opens.", 85000, 1.18, 1150],
    ["well", "Well", "Skims a copy. Burst it when it brims.", 700000, 1.19, 9200],
    ["gambler", "Gambler", "Dry fires, then screams.", 5500000, 1.2, 0],
    ["choir", "Choir", "Everyone else hits harder.", 48000000, 1.21, 620000],
    ["oracle", "Oracle", "Wider gate. Tighter pulse.", 420000000, 1.22, 5200000],
    ["singularity", "Singularity", "A cut of everything you already hold.", 12000000000, 1.55, 0],
  ];
  const SPARKS = [
    ["oil", "Strike oil", "Clicks hit harder.", 2, 1.62, 40],
    ["keen", "Keen gate", "The sync window opens wider.", 3, 1.85, 6],
    ["loaded", "Loaded dice", "Gamblers win more often.", 4, 2.05, 5],
    ["crit", "Crit core", "Crits bite deeper.", 3, 1.72, 20],
    ["vault", "Vault seal", "Well bursts pay more.", 3, 1.68, 20],
  ];
  const ECHOS = [
    ["strike", "Inscription", "Permanent click power.", 1, 1.55, 40],
    ["orbits", "Orbits", "Every loop produces more.", 1, 1.6, 40],
    ["thermal", "Thermal", "Heat multiplies harder.", 2, 1.7, 12],
    ["memory", "Memory", "Collapse gifts you flickers.", 1, 1.85, 10],
    ["fate", "Fate", "Storms lean loud.", 3, 2.1, 6],
    ["ambition", "Ambition", "Collapses mint more echoes.", 2, 1.75, 15],
    ["chorus", "Chorus", "Choirs conduct a bigger room.", 4, 1.9, 10],
    ["horizon", "Horizon", "The singularity takes a larger cut.", 5, 2, 8],
  ];
  const RELICS = {
    glass: ["Glass hammer", "Clicks +80%. Heat climbs faster."],
    patient: ["Patient well", "The well skims more and bursts harder."],
    coin: ["Lucky coin", "Gamblers hit more often."],
    metro: ["Metronome", "Wider sync. Misses hit softer."],
    aftershock: ["Aftershock", "Crits carry a second shock."],
    cold: ["Cold kiln", "Less heat, more flux."],
    haven: ["Tax haven", "The taxman cannot skim you."],
    conductor: ["Conductor", "Choirs pull harder."],
    greedy: ["Greedy gear", "Production +25%. Offline pays nothing."],
  };
  const STORMS = {
    golden: ["Golden hour", "Everything the press makes is heavy.", 18],
    frenzy: ["Crit frenzy", "Every strike crits.", 12],
    lightning: ["Live wire", "The machine strikes itself.", 8],
    tear: ["Rift tear", "Your clicks tear a hole. Hit it.", 10],
    quiet: ["Quiet", "The press holds its breath.", 8],
    tax: ["The taxman", "He takes a cut. The rest runs hotter.", 16],
    jackpot: ["Jackpot", "Tap to stop the reels.", 30],
    echo: ["Echo leak", "A little prestige slips out early.", 10],
    overclock: ["Overclock", "Heat locked in the sweet band.", 14],
  };
  const SYMBOLS = ["FLUX", "SPARK", "ECHO", "SKULL", "WILD"];
  const SPEEDS = [8.4, 10.6, 13.2];

  const rngNext = (state) => {
    let a = state >>> 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return { state: a >>> 0, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  };

  const blank = () => ({
    v: 1,
    flux: ZERO,
    life: ZERO,
    run: ZERO,
    well: ZERO,
    sparks: 0,
    echoes: 0,
    heat: 0,
    combo: 0,
    comboLeft: 0,
    form: 0,
    streak: 0,
    since: 0,
    collapses: 0,
    owned: Object.fromEntries(LOOPS.map((l) => [l[0], 0])),
    sparkLv: Object.fromEntries(SPARKS.map((s) => [s[0], 0])),
    echoLv: Object.fromEntries(ECHOS.map((s) => [s[0], 0])),
    relics: [],
    draft: null,
    ach: [],
    contracts: [
      { uid: 1, kind: "syncs", label: "Sync 5 beats", need: 5, got: 0, reward: "+2 sparks", pay: 2 },
      { uid: 2, kind: "clicks", label: "Strike 20 times", need: 20, got: 0, reward: "+1 spark", pay: 1 },
      { uid: 3, kind: "buys", label: "Buy a loop", need: 1, got: 0, reward: "+1 spark", pay: 1 },
    ],
    seq: 3,
    rng: 1,
    storm: null,
    nextStorm: 22,
    over: null,
    pips: "",
    acc: { gamble: 0, cascade: 0, rift: 0, lightning: 0 },
    stats: {
      clicks: 0, syncs: 0, crits: 0, buys: 0, vents: 0, perfects: 0, chains: 0,
      bestChain: 0, bursts: 0, storms: 0, bestStreak: 0, bestSync: 0, jackpots: 0,
      wilds: 0, taxes: 0, sparksEarned: 0, overheats: 0, bestForm: 0, offline: 0, gambles: 0,
    },
    settings: { sound: true, shake: true, particles: true, reduce: false },
    lastSeen: 0,
    offline: null,
    time: 0,
    tab: "loops",
    mode: 1,
  });

  const asBig = (v) => (v && Number.isFinite(+v.m) && Number.isFinite(+v.e) ? norm(+v.m, +v.e) : ZERO);
  let S = blank();

  const has = (id) => S.relics.includes(id);
  const gifted = () => S.echoLv.memory * 8;
  const working = (id) => S.owned[id] + (id === "flicker" ? gifted() : 0);
  const achMult = () => 1.012 ** S.ach.length;
  const heatMult = () => 1 + (Math.max(0, Math.min(100, S.heat)) / 100) ** 1.1 * (0.95 + S.echoLv.thermal * 0.14);
  const choirMult = () => {
    const c = S.owned.choir;
    if (!c) return 1;
    const per = 0.04 * (1 + S.echoLv.chorus * 0.28) * (has("conductor") ? 1.5 : 1);
    return 1 + c * per;
  };
  const prodMult = () => {
    let m = heatMult() * achMult() * (1 + S.echoLv.orbits * 0.12);
    const id = S.storm?.id;
    if (id === "golden") m *= 2.75;
    if (id === "tax") m *= 1.6;
    if (id === "overclock") m *= 1.45;
    if (has("cold")) m *= 1.28;
    if (has("greedy")) m *= 1.25;
    return m;
  };
  const beatPeriod = () => Math.max(0.7, 1.16 - S.owned.oracle * 0.028);
  const syncWindow = () => Math.min(0.32, 0.12 + S.owned.oracle * 0.011 + S.sparkLv.keen * 0.012 + (has("metro") ? 0.045 : 0));
  const critChance = () => (S.storm?.id === "frenzy" ? 1 : Math.min(0.62, 0.045 + (S.heat / 100) * 0.3 + S.sparkLv.crit * 0.012));
  const gambleChance = () => Math.min(0.78, 0.54 + S.sparkLv.loaded * 0.02 + (has("coin") ? 0.08 : 0));
  const singFactor = () => (S.owned.singularity ? Math.min(0.16, S.owned.singularity * 0.0034 * (1 + S.echoLv.horizon * 0.4)) : 0);
  const fluxRate = (sing = true) => {
    const mult = prodMult();
    const choir = choirMult();
    let out = ZERO;
    for (const loop of LOOPS) {
      const id = loop[0];
      if (id === "gambler" || id === "singularity") continue;
      const n = working(id);
      if (!n) continue;
      const rate = loop[5] * n * (id === "choir" ? 1 : choir) * mult;
      if (Number.isFinite(rate) && rate > 0) out = add(out, big(rate));
    }
    if (sing && singFactor() && S.flux.m) out = add(out, mulN(S.flux, singFactor()));
    return out;
  };
  const gamblerPower = () => {
    const n = S.owned.gambler;
    if (!n) return ZERO;
    const raw = 78000 * n * prodMult() * choirMult();
    return Number.isFinite(raw) ? big(raw) : ZERO;
  };
  const clickMult = (sync, crit, charged) => {
    let m = Math.min(6.5, 1 + Math.min(S.combo, 48) * 0.05);
    m *= 1 + Math.min(S.streak, 24) * 0.035;
    if (sync) m *= 2.65;
    else if (has("metro")) m *= 0.88;
    if (charged) m *= 4;
    if (crit) m *= (3.4 + S.sparkLv.crit * 0.65) * (has("aftershock") ? 1.45 : 1);
    if (S.storm?.id === "tear") m *= 7;
    m *= 1 + (S.form / 100) * 0.8;
    m *= 1.22 ** S.sparkLv.oil * 1.2 ** S.echoLv.strike * achMult();
    if (has("glass")) m *= 1.8;
    return m;
  };
  const lump = (seconds) => {
    const rate = fluxRate(false);
    return rate.m ? mulN(rate, seconds) : big(Math.max(1, seconds));
  };
  const echoPreview = () => {
    const log = log10b(S.run);
    if (!Number.isFinite(log) || log < 6) return 0;
    return Math.max(1, Math.floor((log - 5) ** 1.42 * (1 + S.echoLv.ambition * 0.22)));
  };
  const lockText = (id) => {
    const life = log10b(S.life);
    if (id === "hammer" && life < Math.log10(40)) return "Lifetime 40 flux";
    if (id === "cascade" && life < Math.log10(900)) return "Lifetime 900 flux";
    if (id === "kiln" && life < Math.log10(8000)) return "Lifetime 8K flux";
    if (id === "rift" && life < Math.log10(60000)) return "Lifetime 60K flux";
    if (id === "well" && life < Math.log10(500000)) return "Lifetime 500K flux";
    if (id === "gambler" && life < Math.log10(2500000)) return "Lifetime 2.5M flux";
    if (id === "choir" && life < Math.log10(25000000)) return "Lifetime 25M flux";
    if (id === "oracle" && S.stats.storms < 2) return "Witness 2 storms";
    if (id === "singularity" && S.collapses < 1) return "Collapse the press once";
    return "";
  };

  const roll = () => {
    const next = rngNext(S.rng || 1);
    S.rng = next.state || 1;
    return next.value;
  };
  const toasts = [];
  const toast = (text) => {
    toasts.push({ id: (toast.n = (toast.n || 0) + 1), text, life: 2.6 });
    if (toasts.length > 3) toasts.shift();
  };
  const giveSparks = (n) => {
    S.sparks += n;
    S.stats.sparksEarned += n;
  };
  const gain = (amount) => {
    if (!amount || amount.m <= 0) return;
    S.flux = add(S.flux, amount);
    S.life = add(S.life, amount);
    S.run = add(S.run, amount);
    S.well = add(S.well, mulN(amount, has("patient") ? 0.11 : 0.065));
    for (const c of S.contracts) if (c.kind === "flux" && c.gotF) c.gotF = add(c.gotF, amount);
  };
  const bump = (kind, n) => {
    for (const c of S.contracts) if (c.kind === kind) c.got += n;
  };

  const ACH = [
    ["first", "First contact", "Strike the core.", (s) => s.stats.clicks >= 1],
    ["c100", "Hundred hands", "Strike 100 times.", (s) => s.stats.clicks >= 100],
    ["c1k", "Thousand hands", "Strike 1,000 times.", (s) => s.stats.clicks >= 1000],
    ["s10", "On the beat", "Land 10 syncs.", (s) => s.stats.syncs >= 10],
    ["s100", "Metronome", "Land 100 syncs.", (s) => s.stats.syncs >= 100],
    ["streak", "Locked in", "A 12-sync streak.", (s) => s.stats.bestSync >= 12],
    ["crits", "White hot", "Land 25 crits.", (s) => s.stats.crits >= 25],
    ["chain", "It kept going", "A chain of 6.", (s) => s.stats.bestChain >= 6],
    ["vent", "Clean vent", "Hit the overheat band.", (s) => s.stats.perfects >= 1],
    ["buys", "Procurement", "Buy 40 loops.", (s) => s.stats.buys >= 40],
    ["full", "Full press", "Own every loop once.", (s) => LOOPS.every((l) => s.owned[l[0]] >= 1)],
    ["col1", "First collapse", "Collapse the press.", (s) => s.collapses >= 1],
    ["col5", "Habit", "Collapse 5 times.", (s) => s.collapses >= 5],
    ["jack", "Three of something", "Resolve a jackpot.", (s) => s.stats.jackpots >= 1],
    ["wild", "All wild", "Stop three wilds.", (s) => s.stats.wilds >= 1],
    ["form", "In the pocket", "Fill the groove meter.", (s) => s.stats.bestForm >= 100],
    ["hot", "Redline", "Overheat the press.", (s) => s.stats.overheats >= 1],
    ["rich", "Heavy", "Lifetime flux hits 1T.", (s) => log10b(s.life) >= 12],
    ["relics", "Reliquary", "Hold 3 relics.", (s) => s.relics.length >= 3],
    ["away", "Still warm", "Claim an offline haul.", (s) => s.stats.offline >= 1],
  ];
  const checkAch = () => {
    for (const ach of ACH) {
      if (S.ach.includes(ach[0]) || !ach[3](S)) continue;
      S.ach.push(ach[0]);
      toast(ach[1]);
    }
  };
  const makeContract = () => {
    const pool = ["clicks", "syncs", "buys"];
    if (S.stats.crits) pool.push("crits");
    if (S.owned.cascade) pool.push("chains");
    if (S.stats.overheats) pool.push("vents");
    if (S.stats.clicks > 8) pool.push("flux");
    const kind = pool[Math.floor(roll() * pool.length)];
    S.seq += 1;
    if (kind === "clicks") {
      const n = 30 + S.collapses * 12;
      return { uid: S.seq, kind, label: `Strike ${n} times`, need: n, got: 0, reward: "+1 spark", pay: 1 };
    }
    if (kind === "syncs") {
      const n = 6 + S.collapses * 3;
      return { uid: S.seq, kind, label: `Sync ${n} beats`, need: n, got: 0, reward: "+2 sparks", pay: 2 };
    }
    if (kind === "buys") {
      const n = 4 + Math.min(10, S.collapses * 2);
      return { uid: S.seq, kind, label: `Buy ${n} loops`, need: n, got: 0, reward: "+1 spark", pay: 1 };
    }
    if (kind === "crits") return { uid: S.seq, kind, label: "Land 8 crits", need: 8, got: 0, reward: "+2 sparks", pay: 2 };
    if (kind === "chains") return { uid: S.seq, kind, label: "Stack 12 chain links", need: 12, got: 0, reward: "+2 sparks", pay: 2 };
    if (kind === "vents") return { uid: S.seq, kind, label: "Vent the press once", need: 1, got: 0, reward: "+2 sparks", pay: 2 };
    const need = lump(22);
    return { uid: S.seq, kind: "flux", label: "Press out a fat lump", need: 0, got: 0, needF: need, gotF: ZERO, reward: "+2 sparks", pay: 2 };
  };
  const checkContracts = () => {
    S.contracts = S.contracts.map((c) => {
      const done = c.kind === "flux" && c.needF && c.gotF ? gte(c.gotF, c.needF) : c.need > 0 && c.got >= c.need;
      if (!done) return c;
      giveSparks(c.pay || 1);
      toast(`Sealed · ${c.reward}`);
      return makeContract();
    });
  };

  const offerDraft = () => {
    if (S.draft?.length) return;
    const pool = Object.keys(RELICS).filter((id) => !S.relics.includes(id));
    if (!pool.length) return;
    const picks = [];
    while (picks.length < 3 && pool.length) {
      const i = Math.min(pool.length - 1, Math.floor(roll() * pool.length));
      picks.push(pool.splice(i, 1)[0]);
    }
    S.draft = picks;
    toast("A relic cooled out of the press");
  };
  const reelSymbol = (storm, index) => {
    const t = storm.locked[index] == null ? storm.age : storm.locked[index];
    const pos = storm.offsets[index] + t * SPEEDS[index];
    const idx = ((Math.floor(pos) % 5) + 5) % 5;
    return SYMBOLS[idx];
  };
  const resolveJackpot = () => {
    const storm = S.storm;
    if (!storm || storm.result) return;
    for (let i = 0; i < 3; i += 1) if (storm.locked[i] == null) storm.locked[i] = Math.min(storm.age, 3.35);
    const syms = [0, 1, 2].map((i) => reelSymbol(storm, i));
    storm.result = syms;
    S.stats.jackpots += 1;
    let title = syms.join(" · ");
    const wilds = syms.filter((s) => s === "WILD").length;
    const score = (sym) => syms.filter((s) => s === sym || s === "WILD").length;
    if (wilds === 3) {
      S.stats.wilds += 1;
      gain(lump(48));
      giveSparks(3);
      title = "ALL WILD";
    } else if (score("FLUX") >= 3) {
      gain(lump(28));
      title = "FLUX JACKPOT";
    } else if (score("SPARK") >= 3) {
      const n = 4 + S.collapses;
      giveSparks(n);
      title = `+${n} SPARKS`;
    } else if (score("ECHO") >= 3) {
      const n = 1 + Math.floor(S.collapses / 2);
      S.echoes += n;
      title = `+${n} ECHO`;
    } else if (score("SKULL") >= 3) {
      gain(lump(10));
      S.heat = 100;
      S.over = { t: 0, dur: 2.35 };
      S.stats.overheats += 1;
      title = "SKULL — REDLINE";
    } else if (Math.max(score("FLUX"), score("SPARK"), score("ECHO"), score("SKULL")) === 2) {
      gain(lump(7));
      title = "PAIR";
    } else gain(lump(2));
    storm.detail = title;
    storm.dur = storm.age + 2.1;
    toast(title);
    audio.jackpot();
    juice.bump(0.8);
  };
  const beginStorm = () => {
    const f = S.echoLv.fate;
    const table = [
      ["golden", 16 + f * 3],
      ["frenzy", 13 + f * 2],
      ["lightning", 12 + f],
      ["tear", 11 + f * 2],
      ["quiet", Math.max(4, 15 - f * 2)],
      ["tax", Math.max(3, 10 - f * 1.4)],
      ["jackpot", 8 + f * 2],
      ["echo", 7 + f * 2],
      ["overclock", 10 + f],
    ];
    const total = table.reduce((s, row) => s + row[1], 0);
    let r = roll() * total;
    let id = table[table.length - 1][0];
    for (const row of table) {
      r -= row[1];
      if (r <= 0) {
        id = row[0];
        break;
      }
    }
    const copy = STORMS[id];
    S.storm = {
      id,
      name: copy[0],
      detail: copy[1],
      age: 0,
      dur: id === "jackpot" ? 30 : copy[2],
      offsets: [roll() * 5, roll() * 5, roll() * 5],
      locked: [null, null, null],
      result: null,
    };
    S.stats.storms += 1;
    if (id === "tax") {
      S.stats.taxes += 1;
      if (has("haven")) {
        S.storm.detail = "The taxman knocks. The haven holds.";
        toast("Taxman turned away");
      } else {
        S.flux = mulN(S.flux, 0.86);
        toast("Taxman took 14%");
      }
    }
    if (id === "echo") {
      const n = 1;
      S.echoes += n;
      S.storm.detail = `+${n} echo slipped the seal.`;
      toast("+1 echo");
    }
    if (id === "quiet") toast("Quiet");
    if (S.stats.storms % 4 === 0) offerDraft();
    audio.storm();
    juice.bump(0.35);
  };

  const resolveVent = (perfect) => {
    S.over = null;
    S.stats.vents += 1;
    const amount = lump(perfect ? 14 : 2.4);
    S.heat = perfect ? 36 : 14;
    gain(amount);
    if (perfect) {
      S.stats.perfects += 1;
      S.form = Math.min(100, S.form + 12);
      giveSparks(1);
      toast("Perfect vent");
      juice.bump(0.7);
      if (!S.settings.reduce) juice.hitstop = 0.07;
    } else toast("Vented");
    bump("vents", 1);
    audio.vent(perfect);
    juice.flash = perfect ? 1 : 0.3;
    spawnFloater(css.w * 0.5, css.h * 0.5, perfect ? "PERFECT" : "VENT", perfect ? 2 : 1);
  };

  const strike = () => {
    if (S.storm?.id === "jackpot" && !S.storm.result && S.storm.locked.some((v) => v == null)) {
      const i = S.storm.locked.findIndex((v) => v == null);
      S.storm.locked[i] = S.storm.age;
      audio.click(true, false, 0);
      if (S.storm.locked.every((v) => v != null)) resolveJackpot();
      paintUI(true);
      return;
    }
    if (S.over) {
      const p = S.over.t / S.over.dur;
      resolveVent(p >= 0.4 && p <= 0.68);
      checkContracts();
      checkAch();
      paintUI(true);
      return;
    }
    const period = beatPeriod();
    const phase = S.time % period;
    const sync = Math.min(phase, period - phase) <= syncWindow();
    const charged = S.since > 3.15 && S.stats.clicks > 0;
    const crit = roll() < critChance();
    const amount = big(clickMult(sync, crit, charged));
    gain(amount);
    S.stats.clicks += 1;
    S.since = 0;
    if (sync) {
      S.stats.syncs += 1;
      S.streak += 1;
      S.stats.bestSync = Math.max(S.stats.bestSync, S.streak);
      S.form = Math.min(100, S.form + 2.6);
      S.combo = Math.min(80, S.combo + 2);
    } else {
      S.streak = 0;
      S.combo = Math.min(80, S.combo + 1);
    }
    S.comboLeft = Math.max(0.75, beatPeriod() * 1.3);
    if (crit) {
      S.stats.crits += 1;
      if (roll() < 0.1) giveSparks(1);
    }
    S.heat = Math.min(100, S.heat + (has("glass") ? 3.1 : 2.15));
    S.stats.bestForm = Math.max(S.stats.bestForm, S.form);
    bump("clicks", 1);
    if (sync) bump("syncs", 1);
    if (crit) bump("crits", 1);
    const label = charged ? "CHARGED" : crit ? "CRIT" : sync ? "SYNC" : `+${format(amount)}`;
    spawnFloater(pointer.x, pointer.y - 16, label, crit ? 2 : sync ? 1 : 0);
    if (sync || crit || charged) spawnFloater(pointer.x, pointer.y + 6, `+${format(amount)}`, 0);
    juice.pulse = 1;
    if (sync) juice.bump(0.22);
    if (crit) juice.bump(0.45);
    if (charged) juice.bump(0.35);
    if (crit && S.storm?.id !== "frenzy" && !S.settings.reduce) juice.hitstop = 0.04;
    juice.flash = crit ? 1 : sync ? 0.45 : 0.12;
    if (S.settings.particles && !S.settings.reduce) burst(pointer.x, pointer.y, crit ? 16 : sync ? 10 : 6, crit ? 220 : 130, crit ? 2 : 0);
    audio.click(sync, crit, S.combo);
    if (sync && S.settings.shake) navigator.vibrate?.(10);
    checkContracts();
    checkAch();
    paintUI(true);
  };

  const buy = (id) => {
    const loop = LOOPS.find((l) => l[0] === id);
    if (!loop || lockText(id)) return;
    const afford = maxBuy(loop[3], loop[4], S.owned[id], S.flux);
    const mode = S.mode === "max" ? afford : Math.min(S.mode, afford);
    if (mode <= 0) return;
    const cost = costBulk(loop[3], loop[4], S.owned[id], mode);
    if (!gte(S.flux, cost)) return;
    S.flux = add(S.flux, mulN(cost, -1));
    if (S.flux.m < 0) S.flux = ZERO;
    S.owned[id] += mode;
    S.stats.buys += mode;
    bump("buys", mode);
    audio.buy();
    toast(`${loop[1]} ×${mode}`);
    checkContracts();
    checkAch();
    paintUI(true);
  };
  const buySpark = (id) => {
    const def = SPARKS.find((s) => s[0] === id);
    const level = S.sparkLv[id];
    if (!def || level >= def[5]) return;
    const cost = Math.max(1, Math.round(def[3] * def[4] ** level));
    if (S.sparks < cost) return;
    S.sparks -= cost;
    S.sparkLv[id] = level + 1;
    audio.buy();
    toast(def[1]);
    paintUI(true);
  };
  const buyEcho = (id) => {
    const def = ECHOS.find((s) => s[0] === id);
    const level = S.echoLv[id];
    if (!def || level >= def[5]) return;
    const cost = Math.max(1, Math.round(def[3] * def[4] ** level));
    if (S.echoes < cost) return;
    S.echoes -= cost;
    S.echoLv[id] = level + 1;
    audio.buy();
    toast(def[1]);
    paintUI(true);
  };
  const burstWell = () => {
    if (!S.well.m) return;
    let pay = mulN(S.well, 1.15 + S.sparkLv.vault * 0.16);
    if (has("patient")) pay = mulN(pay, 1.45);
    S.well = ZERO;
    gain(pay);
    S.stats.bursts += 1;
    toast(`Well +${format(pay)}`);
    audio.buy();
    juice.bump(0.3);
    checkContracts();
    checkAch();
    paintUI(true);
  };
  const collapse = () => {
    const echoes = echoPreview();
    if (!echoes) {
      toast("Not heavy enough yet");
      return;
    }
    const keep = {
      settings: S.settings,
      echoLv: S.echoLv,
      ach: S.ach,
      stats: S.stats,
      life: S.life,
      relics: S.relics,
      rng: S.rng,
    };
    const next = blank();
    next.settings = keep.settings;
    next.echoLv = keep.echoLv;
    next.ach = keep.ach;
    next.stats = keep.stats;
    next.life = keep.life;
    next.relics = keep.relics;
    next.rng = keep.rng;
    next.collapses = S.collapses + 1;
    next.echoes = S.echoes + echoes;
    next.flux = big(40 + next.collapses * 25);
    next.tab = "echo";
    next.mode = S.mode;
    S = next;
    offerDraft();
    toast(`Collapsed · +${echoes} echo`);
    juice.bump(1);
    closeModal();
    paintUI(true);
    save();
  };

  const step = (dt) => {
    S.time += dt;
    S.since += dt;
    if (S.combo > 0) {
      S.comboLeft -= dt;
      if (S.comboLeft <= 0) S.combo = 0;
    }
    S.form = Math.max(0, S.form - dt * 0.26);
    if (S.storm) {
      S.storm.age += dt;
      if (S.storm.id === "overclock") S.heat = 72;
      if (S.storm.id === "jackpot" && !S.storm.result) {
        const all = S.storm.locked.every((v) => v != null);
        if (all || S.storm.age >= 3.35) resolveJackpot();
      }
      if (S.storm.age >= S.storm.dur) {
        S.storm = null;
        S.nextStorm = 26 + roll() * 20;
      }
    } else {
      S.nextStorm -= dt;
      if (S.nextStorm <= 0) beginStorm();
    }
    if (S.over) {
      S.over.t += dt;
      if (S.over.t >= S.over.dur) resolveVent(false);
    } else if (S.storm?.id !== "overclock") {
      const heatIn = (S.owned.hammer * 0.18 + S.owned.kiln * 0.72) * (has("cold") ? 0.55 : 1) * (has("glass") ? 1.4 : 1);
      const decay = 5.2 * (1 - Math.min(0.45, S.echoLv.thermal * 0.045));
      S.heat = Math.min(100, Math.max(0, S.heat + (heatIn - decay) * dt));
      if (S.heat >= 100) {
        S.heat = 100;
        S.over = { t: 0, dur: 2.35 };
        S.stats.overheats += 1;
        toast("Overheat — tap the bright band");
      }
    }
    gain(mulN(fluxRate(true), dt));
    if (S.owned.gambler) {
      S.acc.gamble += dt;
      let guard = 0;
      while (S.acc.gamble >= 0.9 && guard < 4) {
        S.acc.gamble -= 0.9;
        guard += 1;
        const power = gamblerPower();
        if (roll() < gambleChance()) {
          const pay = mulN(power, 2.05);
          gain(pay);
          S.stats.gambles += 1;
          S.pips = (S.pips + "w").slice(-10);
          spawnFloater(css.w * 0.66, css.h * 0.48, `+${format(pay)}`, 1);
        } else S.pips = (S.pips + "l").slice(-10);
      }
    }
    if (S.owned.cascade) {
      S.acc.cascade += dt;
      if (S.acc.cascade >= 0.55) {
        S.acc.cascade = 0;
        let chance = Math.min(0.42, 0.14 + S.owned.cascade * 0.004);
        if (roll() < chance) {
          let chains = 1;
          while (chains < 12 && roll() < chance * 0.68 ** chains) chains += 1;
          const unit = LOOPS[2][5] * S.owned.cascade * 0.42;
          if (Number.isFinite(unit)) gain(mulN(big(unit), chains));
          S.stats.chains += chains;
          S.stats.bestChain = Math.max(S.stats.bestChain, chains);
          bump("chains", chains);
          if (chains >= 2) {
            spawnFloater(css.w * 0.5, css.h * 0.4, `CHAIN ${chains}`, 2);
            audio.chain(chains);
          }
        }
      }
    }
    if (S.owned.rift) {
      S.acc.rift += dt;
      const every = Math.max(4.2, 8.5 - S.owned.rift * 0.08);
      if (S.acc.rift >= every) {
        S.acc.rift = 0;
        const r = roll();
        if (r < 0.62) {
          const amount = lump(3.2);
          gain(amount);
          toast(`Rift +${format(amount)}`);
        } else if (r < 0.84) {
          giveSparks(1);
          toast("Rift +1 spark");
        } else if (r < 0.95) {
          S.heat = Math.max(0, S.heat - 18);
          toast("Rift vented heat");
        } else {
          S.echoes += 1;
          toast("Rift +1 echo");
        }
      }
    }
    if (S.storm?.id === "lightning") {
      S.acc.lightning += dt;
      let guard = 0;
      while (S.acc.lightning >= 0.2 && guard < 4) {
        S.acc.lightning -= 0.2;
        guard += 1;
        gain(big(clickMult(false, false, false) * 0.55));
        if (S.settings.particles && guard === 1) burst(css.w * 0.5, css.h * 0.56, 4, 90, 0);
      }
    }
    checkContracts();
    checkAch();
  };

  const applyOffline = (seconds) => {
    const cap = Math.min(Math.max(0, seconds), 60 * 60 * 8);
    if (cap < 12) return;
    const paid = has("greedy") ? 0 : 0.62;
    let gained = paid ? mulN(fluxRate(false), cap * paid) : ZERO;
    const ev = mulN(gamblerPower(), (gambleChance() * 2.05) / 0.9);
    if (paid && ev.m) gained = add(gained, mulN(ev, cap * paid));
    if (paid && singFactor()) gained = add(gained, mulN(S.flux, Math.min(1.25, singFactor() * cap * 0.2)));
    gain(gained);
    S.since = 4;
    S.offline = { seconds: Math.round(cap), amount: format(gained) };
    S.stats.offline += 1;
    checkAch();
  };

  const audio = {
    ctx: null,
    master: null,
    voices: 0,
    unlock() {
      if (!this.ctx) {
        const ctx = new AudioContext({ latencyHint: "interactive" });
        const master = ctx.createGain();
        const sfx = ctx.createGain();
        const bed = ctx.createGain();
        sfx.gain.value = 0.9;
        bed.gain.value = 0.02;
        master.gain.value = S.settings.sound ? 0.7 : 0;
        sfx.connect(master);
        bed.connect(master);
        master.connect(ctx.destination);
        const a = ctx.createOscillator();
        const b = ctx.createOscillator();
        a.type = "sine";
        b.type = "triangle";
        a.frequency.value = 55;
        b.frequency.value = 82.5;
        a.connect(bed);
        b.connect(bed);
        a.start();
        b.start();
        this.ctx = ctx;
        bin.audio = ctx;
        this.master = master;
        this.sfx = sfx;
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    },
    mute(off) {
      if (!this.ctx || !this.master) return;
      this.master.gain.setTargetAtTime(off ? 0 : 0.7, this.ctx.currentTime, 0.03);
    },
    tone(freq, dur, type, gain, slide = 0) {
      if (!this.ctx || !this.sfx || !S.settings.sound || this.voices > 12) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(this.sfx);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      this.voices += 1;
      osc.onended = () => {
        this.voices = Math.max(0, this.voices - 1);
      };
    },
    click(sync, crit, combo) {
      const freq = ((sync ? 740 : 480) + Math.min(combo, 24) * 14) * (0.94 + Math.random() * 0.12);
      this.tone(freq, sync ? 0.12 : 0.06, "triangle", sync ? 0.16 : 0.08, sync ? 80 : -40);
      if (sync) this.tone(freq * 1.5, 0.14, "sine", 0.07, 30);
      if (crit) this.tone(180, 0.16, "sine", 0.12, -50);
    },
    buy() {
      this.tone(660, 0.07, "square", 0.05);
      this.tone(990, 0.09, "sine", 0.05);
    },
    vent(perfect) {
      this.tone(perfect ? 220 : 90, 0.2, "sine", perfect ? 0.16 : 0.08, perfect ? 120 : -20);
    },
    storm() {
      this.tone(70, 0.35, "sawtooth", 0.04, 30);
    },
    chain(n) {
      this.tone(300 + n * 36, 0.08, "square", 0.04, 50);
    },
    jackpot() {
      [523, 659, 784, 1046].forEach((freq, i) => setTimeout(() => this.tone(freq, 0.14, "triangle", 0.08), i * 90));
    },
  };

  const particles = Array.from({ length: 280 }, () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, w: 1, kind: 0 }));
  let pCursor = 0;
  const burst = (x, y, count, speed, kind) => {
    for (let i = 0; i < count; i += 1) {
      const speck = particles[pCursor];
      pCursor = (pCursor + 1) % particles.length;
      if (!speck || speck.alive) continue;
      const a = (i / count) * Math.PI * 2;
      const s = speed * (0.45 + Math.random() * 0.6);
      speck.alive = true;
      speck.x = x;
      speck.y = y;
      speck.vx = Math.cos(a) * s;
      speck.vy = Math.sin(a) * s;
      speck.life = speck.max = 0.28 + Math.random() * 0.3;
      speck.w = 1.2;
      speck.kind = kind;
    }
  };
  const floaters = [];
  const spawnFloater = (x, y, text, hot) => {
    if (floaters.length > 20) floaters.shift();
    floaters.push({ x, y, text, life: 0.85, max: 0.85, hot });
  };
  const juice = { trauma: 0, pulse: 0, flash: 0, hitstop: 0, bump(n) { this.trauma = Math.min(1, this.trauma + n); } };
  const css = { w: 1, h: 1, dpr: 1 };
  const pointer = { x: 0, y: 0 };
  let glow;
  const makeGlow = () => {
    const c = document.createElement("canvas");
    c.width = c.height = 160;
    const g = c.getContext("2d");
    const rad = g.createRadialGradient(80, 80, 0, 80, 80, 80);
    rad.addColorStop(0, "rgba(255,244,214,0.95)");
    rad.addColorStop(0.16, "rgba(255,176,32,0.55)");
    rad.addColorStop(0.42, "rgba(255,77,26,0.16)");
    rad.addColorStop(1, "rgba(255,77,26,0)");
    g.fillStyle = rad;
    g.fillRect(0, 0, 160, 160);
    return c;
  };
  glow = makeGlow();
  const ctx = view.getContext("2d");

  const draw = (visualTime) => {
    const w = css.w;
    const h = css.h;
    const shake = !S.settings.reduce && S.settings.shake ? juice.trauma ** 2 : 0;
    const ox = Math.sin(visualTime * 41) * 7 * shake;
    const oy = Math.cos(visualTime * 33) * 5 * shake;
    ctx.setTransform(css.dpr, 0, 0, css.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ox, oy);
    const cx = w * 0.5;
    const cy = h * 0.56;
    const reach = Math.min(w, h);
    const coreR = Math.max(34, reach * 0.16);
    const bg = ctx.createRadialGradient(cx, cy, coreR * 0.2, cx, cy, reach * 0.85);
    bg.addColorStop(0, "#16130e");
    bg.addColorStop(0.5, "#0c0d11");
    bg.addColorStop(1, "#090a0c");
    ctx.fillStyle = bg;
    ctx.fillRect(-20, -20, w + 40, h + 40);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = "rgba(244,239,230,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 48; i += 1) {
      const a = (i / 48) * Math.PI * 2;
      const outer = reach * 0.46;
      const inner = i % 4 === 0 ? outer * 0.9 : outer * 0.95;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.stroke();
    }
    ctx.restore();
    const period = beatPeriod();
    const phaseT = ((visualTime % period) + period) % period;
    const phase = phaseT / period;
    const inGate = Math.min(phaseT, period - phaseT) <= syncWindow();
    const heat = S.heat / 100;
    const color = heat < 0.62 ? `rgb(${255},${Math.round(176 - (176 - 77) * (heat / 0.62))},${Math.round(32 - 6 * (heat / 0.62))})` : `rgb(255,${Math.round(77 + (244 - 77) * ((heat - 0.62) / 0.38))},${Math.round(26 + (214 - 26) * ((heat - 0.62) / 0.38))})`;
    let orbit = 0;
    for (const loop of LOOPS) {
      const n = working(loop[0]);
      if (!n) continue;
      const count = Math.min(14, 3 + Math.floor(Math.sqrt(n)));
      const radius = coreR + 26 + orbit * Math.max(10, (reach * 0.33 - coreR) / 10);
      const speed = (orbit % 2 ? -0.27 : 0.35) * (1 + orbit * 0.08);
      ctx.fillStyle = loop[0] === "singularity" ? "#ff4d1a" : loop[0] === "gambler" ? "#fff4d6" : "#ffb020";
      for (let i = 0; i < count; i += 1) {
        const a = visualTime * speed + (i / count) * Math.PI * 2;
        const s = 2 + Math.min(3.2, Math.log2(n + 1) * 0.3);
        ctx.globalAlpha = 0.5 + (i % 3) * 0.12;
        ctx.fillRect(cx + Math.cos(a) * radius - s / 2, cy + Math.sin(a) * radius - s / 2, s, s);
      }
      orbit += 1;
    }
    ctx.globalAlpha = 1;
    const pulse = 1 + juice.pulse * 0.16 + (inGate ? 0.035 : 0);
    const gr = coreR * 2.45 * pulse;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1 + juice.pulse * 0.14, 1 - juice.pulse * 0.1);
    ctx.drawImage(glow, -gr, -gr, gr * 2, gr * 2);
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < 5; i += 1) {
      ctx.save();
      ctx.rotate(visualTime * (i % 2 ? 0.22 : -0.16) + i);
      ctx.beginPath();
      ctx.arc(0, 0, coreR * (0.72 + i * 0.16), 0.35, Math.PI * 1.45);
      ctx.strokeStyle = i === 1 ? color : "rgba(244,239,230,0.28)";
      ctx.globalAlpha = i === 1 ? 0.9 : 0.4;
      ctx.lineWidth = i === 4 ? 2 : 1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 0.46 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    const gateR = coreR + 16;
    const windowAng = (syncWindow() / period) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, gateR, -Math.PI / 2 - windowAng / 2, -Math.PI / 2 + windowAng / 2);
    ctx.strokeStyle = inGate ? "#fff4d6" : "rgba(255,176,32,0.45)";
    ctx.lineWidth = inGate ? 7 : 3;
    ctx.stroke();
    const ang = -Math.PI / 2 + phase * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(ang) * gateR, cy + Math.sin(ang) * gateR);
    ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = inGate ? "#fff4d6" : "#ffb020";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (S.over) {
      const p = S.over.t / S.over.dur;
      const sweet = p >= 0.4 && p <= 0.68;
      const x = Math.min(w - 28, cx + reach * 0.32);
      const top = cy - 78;
      ctx.fillStyle = "rgba(244,239,230,0.08)";
      ctx.fillRect(x, top, 10, 156);
      ctx.fillStyle = "rgba(255,176,32,0.45)";
      ctx.fillRect(x, top + 156 * 0.4, 10, 156 * 0.28);
      ctx.fillStyle = sweet ? "#fff4d6" : "#ff4d1a";
      ctx.fillRect(x - 4, top + 156 * p - 2, 18, 4);
    }
    if (S.storm?.id === "jackpot") {
      const boxW = Math.min(78, w * 0.2);
      const boxH = 34;
      const left = cx - (boxW * 3 + 16) / 2;
      const top = Math.max(78, cy - coreR - 70);
      for (let i = 0; i < 3; i += 1) {
        const t = S.storm.locked[i] == null ? S.storm.age : S.storm.locked[i];
        const pos = S.storm.offsets[i] + t * SPEEDS[i];
        const label = SYMBOLS[((Math.floor(pos) % 5) + 5) % 5];
        const x = left + i * (boxW + 8);
        ctx.fillStyle = "#12141a";
        ctx.strokeStyle = S.storm.locked[i] == null ? "#ffb020" : "#fff4d6";
        ctx.lineWidth = 1.5;
        ctx.fillRect(x, top, boxW, boxH);
        ctx.strokeRect(x, top, boxW, boxH);
        ctx.fillStyle = label === "SKULL" ? "#ff4d1a" : "#ffb020";
        ctx.font = `600 11px "IBM Plex Mono", ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x + boxW / 2, top + boxH / 2);
      }
      ctx.fillStyle = "rgba(244,239,230,0.75)";
      ctx.font = `500 11px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.fillText(S.storm.result ? S.storm.detail : "TAP TO STOP", cx, top + boxH + 16);
    }
    if (juice.flash > 0) {
      ctx.fillStyle = `rgba(255,244,214,${juice.flash * 0.16})`;
      ctx.fillRect(-20, -20, w + 40, h + 40);
    }
    const drag = 0.92;
    for (const speck of particles) {
      if (!speck.alive) continue;
      speck.life -= 0.016;
      if (speck.life <= 0) {
        speck.alive = false;
        continue;
      }
      speck.x += speck.vx * 0.016;
      speck.y += speck.vy * 0.016;
      speck.vx *= drag;
      speck.vy *= drag;
      ctx.globalAlpha = Math.max(0, speck.life / speck.max);
      ctx.strokeStyle = speck.kind === 2 ? "#fff4d6" : speck.kind === 1 ? "#ff4d1a" : "#ffb020";
      ctx.lineWidth = speck.w;
      ctx.beginPath();
      ctx.moveTo(speck.x, speck.y);
      ctx.lineTo(speck.x - speck.vx * 0.04, speck.y - speck.vy * 0.04);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = "alphabetic";
    ctx.font = `600 13px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.textAlign = "center";
    for (let i = floaters.length - 1; i >= 0; i -= 1) {
      const f = floaters[i];
      f.life -= 0.016;
      f.y -= 0.6;
      if (f.life <= 0) {
        floaters.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.fillStyle = f.hot === 2 ? "#fff4d6" : f.hot === 1 ? "#ffb020" : "#f4efe6";
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    const scars = Math.min(8, S.collapses);
    ctx.strokeStyle = "rgba(255,77,26,0.55)";
    for (let i = 0; i < scars; i += 1) {
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 0.5 + 3 + i * 2, 0.4 + i, 1.4 + i);
      ctx.stroke();
    }
  };

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const svg = (d) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const ICONS = {
    flicker: "M13 2 4 14h7l-1 8 9-12h-7l1-8z",
    hammer: "M14 4 20 10 M8 14 4 18l2 2 4-4 M9 13l8-8 2 2-8 8",
    cascade: "M4 7h16M4 12h16M4 17h10",
    kiln: "M12 3s6 6 6 10a6 6 0 0 1-12 0c0-4 6-10 6-10z",
    rift: "M12 3a9 9 0 1 0 9 9M12 7v5l3 2",
    well: "M12 3c4 2 6 3 6 3v6c0 5-6 9-6 9s-6-4-6-9V6s2-1 6-3z",
    gambler: "M5 5h6v6H5zM13 13h6v6h-6zM13 5h2M17 9h2M5 15h2M9 19h2",
    choir: "M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4",
    oracle: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    singularity: "M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 3a9 9 0 0 1 0 18M12 3a9 9 0 0 0 0 18",
  };

  const panel = $("panel");
  const tabs = $("tabs");
  const modes = $("modes");
  const quick = $("quick");
  let shopSig = "";
  const rateText = () => {
    const passive = fluxRate(false);
    const ev = mulN(gamblerPower(), (gambleChance() * 2.05) / 0.9);
    return `${format(add(passive, ev))}/s`;
  };
  const loopRateText = (loop) => {
    const id = loop[0];
    if (id === "gambler") {
      const ev = mulN(gamblerPower(), (gambleChance() * 2.05) / 0.9);
      return ev.m ? `${format(ev)}/s avg` : "swings";
    }
    if (id === "singularity") {
      const f = singFactor();
      return f ? `${(f * 100).toFixed(2)}% of pile /s` : "a cut of the pile";
    }
    const n = working(id);
    if (!n) return "idle";
    const per = loop[5] * n * (id === "choir" ? 1 : choirMult()) * prodMult();
    return Number.isFinite(per) ? `${format(big(per))}/s` : "a lot/s";
  };

  const renderShop = () => {
    const visible = [];
    let locked = 0;
    for (const loop of LOOPS) {
      const lock = lockText(loop[0]);
      if (!lock) visible.push(loop);
      else if (locked < 2) {
        visible.push(loop);
        locked += 1;
      }
    }
    const sig = [
      S.tab,
      S.mode,
      visible.map((l) => S.owned[l[0]]).join(","),
      S.sparks,
      S.echoes,
      S.pips,
      S.draft?.join("") || "",
      S.relics.join(""),
      S.contracts.map((c) => `${c.uid}:${c.got}:${c.gotF ? c.gotF.e : 0}`).join("|"),
      visible.map((l) => (lockText(l[0]) ? "L" : maxBuy(l[3], l[4], S.owned[l[0]], S.flux) > 0 ? "A" : "N")).join(""),
      S.offline ? 1 : 0,
    ].join("~");
    if (sig === shopSig) return;
    shopSig = sig;
    const scroll = panel.scrollTop;
    panel.replaceChildren();
    if (S.tab === "loops") {
      for (const loop of visible) {
        const id = loop[0];
        const lock = lockText(id);
        const affordN = lock ? 0 : maxBuy(loop[3], loop[4], S.owned[id], S.flux);
        const qty = S.mode === "max" ? affordN : Math.min(Number(S.mode), affordN);
        const priced = qty > 0 ? qty : 1;
        const card = el("article", "card");
        const icon = el("div", "markbox");
        icon.innerHTML = svg(ICONS[id] || ICONS.flicker);
        const body = el("div");
        const title = el("h3", "name", loop[1]);
        const count = el("span", "count", `×${S.owned[id]}${id === "flicker" && gifted() ? `+${gifted()}` : ""}`);
        title.append(count);
        body.append(title, el("p", "blurb", loop[2]), el("p", "meta", lock || loopRateText(loop)));
        if (id === "gambler" && S.pips) {
          const pips = el("div", "pips");
          for (const pip of S.pips) pips.append(el("i", pip));
          body.append(pips);
        }
        const button = el("button", qty > 0 ? "buy go" : "buy");
        button.type = "button";
        button.disabled = qty <= 0;
        button.dataset.buy = id;
        const top = el("span", "", qty > 0 ? `${qty}×` : "1×");
        const bot = el("small", "", lock ? "Locked" : format(costBulk(loop[3], loop[4], S.owned[id], priced)));
        button.append(top, bot);
        card.append(icon, body, button);
        panel.append(card);
      }
    } else if (S.tab === "sparks" || S.tab === "echo") {
      const list = S.tab === "sparks" ? SPARKS : ECHOS;
      const wallet = S.tab === "sparks" ? S.sparks : S.echoes;
      const levels = S.tab === "sparks" ? S.sparkLv : S.echoLv;
      for (const def of list) {
        const level = levels[def[0]];
        const maxed = level >= def[5];
        const cost = Math.max(1, Math.round(def[3] * def[4] ** level));
        const card = el("article", "card");
        const body = el("div");
        const title = el("h3", "name", def[1]);
        title.append(el("span", "count", `${level}/${def[5]}`));
        body.append(title, el("p", "blurb", def[2]));
        const button = el("button", !maxed && wallet >= cost ? "buy go" : "buy");
        button.type = "button";
        button.disabled = maxed || wallet < cost;
        button.dataset[S.tab === "sparks" ? "spark" : "echo"] = def[0];
        button.append(el("span", "", maxed ? "MAX" : String(cost)), el("small", "", S.tab === "sparks" ? "sparks" : "echo"));
        card.append(el("div", "markbox"), body, button);
        panel.append(card);
      }
    } else {
      if (S.draft?.length) {
        panel.append(el("p", "blurb", "A relic cooled out. Pick one. A fourth replaces the oldest."));
        for (const id of S.draft) {
          const relic = RELICS[id];
          const button = el("button", "wide buy go", `${relic[0]} — ${relic[1]}`);
          button.type = "button";
          button.dataset.relic = id;
          panel.append(button);
        }
        const skip = el("button", "wide ghost", "Leave it");
        skip.type = "button";
        skip.dataset.skip = "1";
        panel.append(skip);
      }
      if (S.relics.length) {
        panel.append(el("p", "blurb", "Seated relics"));
        for (const id of S.relics) panel.append(el("p", "meta", `${RELICS[id][0]} — ${RELICS[id][1]}`));
      }
      for (const c of S.contracts) {
        const card = el("article", "card");
        const body = el("div");
        body.append(el("h3", "name", c.label), el("p", "meta", c.kind === "flux" && c.needF ? `${format(c.gotF || ZERO)} / ${format(c.needF)}` : `${Math.floor(c.got)} / ${c.need}`));
        const ratio = c.kind === "flux" && c.needF && c.gotF && c.needF.m ? Math.max(0, Math.min(1, 10 ** (log10b(c.gotF) - log10b(c.needF)))) : c.need ? Math.min(1, c.got / c.need) : 0;
        const bar = el("div", "bar");
        const fill = el("i");
        fill.style.width = `${Math.round(ratio * 100)}%`;
        bar.append(fill);
        body.append(el("p", "blurb", c.reward), bar);
        const button = el("button", "buy", "Reroll");
        button.type = "button";
        button.dataset.reroll = String(c.uid);
        button.append(el("small", "", "2 sparks"));
        card.append(el("div", "markbox"), body, button);
        panel.append(card);
      }
      const achBtn = el("button", "wide ghost", `Achievements ${S.ach.length}/${ACH.length}`);
      achBtn.type = "button";
      achBtn.dataset.ach = "1";
      panel.append(achBtn);
      const col = el("button", echoPreview() ? "wide buy go" : "wide", echoPreview() ? `Collapse  +${echoPreview()} echo` : "Collapse at 1M this run");
      col.type = "button";
      col.dataset.collapse = "1";
      panel.append(col, el("p", "blurb", `This run ${format(S.run)}. Loops reset. Echoes stay.`));
    }
    panel.scrollTop = scroll;
  };

  const paintUI = (forceShop = false) => {
    $("flux").textContent = format(S.flux);
    $("rate").textContent = measured || rateText();
    $("combo").textContent = S.combo > 1 ? `combo ${S.combo}` : "";
    $("streak").textContent = S.streak > 1 ? `${S.streak} sync` : "";
    $("heat").style.width = `${Math.max(0, Math.min(100, S.heat))}%`;
    $("sparks").textContent = `${format(big(S.sparks))} sparks`;
    $("echoes").textContent = `${format(big(S.echoes))} echo`;
    $("coach").textContent = S.stats.syncs < 4 ? "Strike as the notch hits the gate." : S.streak >= 4 ? `${S.streak} in a row. Don't blink.` : S.over ? "Tap when the mark crosses the bright band." : "";
    const form = $("form");
    if (form.childElementCount !== 5) {
      form.replaceChildren();
      for (let i = 0; i < 5; i += 1) form.append(el("i"));
    }
    [...form.children].forEach((node, i) => node.classList.toggle("on", S.form / 100 > (i + 0.15) / 5));
    const storm = $("storm");
    if (S.storm) {
      storm.hidden = false;
      storm.replaceChildren(el("strong", "", S.storm.name), el("span", "", S.storm.detail));
      const bar = el("b");
      const fill = el("i");
      const span = S.storm.id === "jackpot" && !S.storm.result ? 3.35 : S.storm.dur;
      fill.style.width = `${Math.max(0, Math.min(100, (S.storm.age / span) * 100))}%`;
      bar.append(fill);
      storm.append(bar);
    } else storm.hidden = true;
    const box = $("toasts");
    box.replaceChildren();
    for (const item of toasts) box.append(el("div", "toast", item.text));
    $("btn-sound").textContent = S.settings.sound ? "Snd" : "Mute";
    if (forceShop) shopSig = "";
    renderShop();
    if (S.offline) openOffline();
  };

  const modal = $("modal");
  const closeModal = () => {
    modal.hidden = true;
    modal.replaceChildren();
  };
  const openSheet = (node) => {
    modal.hidden = false;
    modal.replaceChildren(node);
  };
  const openOffline = () => {
    if (!S.offline || !modal.hidden) return;
    const sheet = el("div", "sheet");
    sheet.append(el("h2", "", "Still warm"), el("p", "", `The press kept working for ${S.offline.seconds > 90 ? `${Math.round(S.offline.seconds / 60)} min` : `${S.offline.seconds}s`}.`), el("p", "", `+${S.offline.amount} flux`));
    const button = el("button", "wide buy go", "Take it");
    button.type = "button";
    listen(button, "click", () => {
      S.offline = null;
      closeModal();
      save();
    });
    sheet.append(button);
    openSheet(sheet);
  };
  const openSettings = () => {
    const sheet = el("div", "sheet");
    sheet.append(el("h2", "", "Press settings"));
    const row = el("div", "rowbtns");
    for (const key of ["sound", "shake", "particles", "reduce"]) {
      const button = el("button", "buy", `${key} ${S.settings[key] ? "on" : "off"}`);
      button.type = "button";
      listen(button, "click", () => {
        S.settings[key] = !S.settings[key];
        if (key === "sound") audio.mute(!S.settings.sound);
        if (key === "reduce" && S.settings.reduce) S.settings.shake = false;
        save();
        openSettings();
      });
      row.append(button);
    }
    const area = el("textarea");
    area.value = JSON.stringify(S);
    const copy = el("button", "buy", "Copy save");
    copy.type = "button";
    listen(copy, "click", async () => {
      area.value = JSON.stringify(S);
      try {
        await navigator.clipboard.writeText(area.value);
        toast("Save copied");
      } catch {
        area.focus();
        area.select();
      }
    });
    const loadBtn = el("button", "buy", "Load save");
    loadBtn.type = "button";
    listen(loadBtn, "click", () => {
      try {
        const parsed = JSON.parse(area.value);
        if (!parsed || parsed.v !== 1) throw new Error("bad");
        S = hydrate(parsed);
        shopSig = "";
        closeModal();
        paintUI(true);
        save();
        toast("Save loaded");
      } catch {
        toast("That save didn't parse");
      }
    });
    const wipe = el("button", "ghost", "Wipe press");
    wipe.type = "button";
    listen(wipe, "click", () => {
      if (wipe.dataset.armed !== "1") {
        wipe.dataset.armed = "1";
        wipe.textContent = "Tap again to wipe";
        return;
      }
      const settings = S.settings;
      S = blank();
      S.settings = settings;
      S.rng = (Math.floor(Math.random() * 2 ** 31) ^ Date.now()) >>> 0 || 1;
      shopSig = "";
      closeModal();
      paintUI(true);
      save();
    });
    const done = el("button", "buy go", "Close");
    done.type = "button";
    listen(done, "click", closeModal);
    sheet.append(row, area, el("div", "rowbtns"));
    sheet.lastChild.append(copy, loadBtn, wipe, done);
    openSheet(sheet);
  };
  const openAch = () => {
    const sheet = el("div", "sheet");
    sheet.append(el("h2", "", "Scars"));
    for (const ach of ACH) {
      const row = el("div", S.ach.includes(ach[0]) ? "ach on" : "ach");
      row.append(el("h3", "name", ach[1]), el("p", "blurb", ach[2]));
      sheet.append(row);
    }
    const done = el("button", "wide buy go", "Close");
    done.type = "button";
    listen(done, "click", closeModal);
    sheet.append(done);
    openSheet(sheet);
  };

  const hydrate = (src) => {
    const base = blank();
    base.flux = asBig(src.flux);
    base.life = asBig(src.life);
    base.run = asBig(src.run);
    base.well = asBig(src.well);
    base.sparks = Math.max(0, +src.sparks || 0);
    base.echoes = Math.max(0, +src.echoes || 0);
    base.heat = Math.min(100, Math.max(0, +src.heat || 0));
    base.combo = +src.combo || 0;
    base.comboLeft = +src.comboLeft || 0;
    base.form = Math.min(100, +src.form || 0);
    base.streak = +src.streak || 0;
    base.since = +src.since || 0;
    base.collapses = +src.collapses || 0;
    base.seq = +src.seq || 3;
    base.rng = (+src.rng || 1) >>> 0 || 1;
    base.nextStorm = +src.nextStorm || 22;
    base.time = +src.time || 0;
    base.lastSeen = +src.lastSeen || 0;
    base.pips = typeof src.pips === "string" ? src.pips.slice(-10) : "";
    base.tab = src.tab || "loops";
    base.mode = src.mode === 10 || src.mode === 100 || src.mode === "max" ? src.mode : 1;
    base.ach = Array.isArray(src.ach) ? src.ach.filter((id) => typeof id === "string") : [];
    base.relics = Array.isArray(src.relics) ? src.relics.filter((id) => RELICS[id]) : [];
    base.draft = Array.isArray(src.draft) ? src.draft.filter((id) => RELICS[id]) : null;
    if (src.owned) for (const loop of LOOPS) base.owned[loop[0]] = Math.max(0, Math.floor(+src.owned[loop[0]] || 0));
    if (src.sparkLv) for (const def of SPARKS) base.sparkLv[def[0]] = Math.max(0, Math.floor(+src.sparkLv[def[0]] || 0));
    if (src.echoLv) for (const def of ECHOS) base.echoLv[def[0]] = Math.max(0, Math.floor(+src.echoLv[def[0]] || 0));
    if (src.stats) for (const key of Object.keys(base.stats)) base.stats[key] = Math.max(0, +src.stats[key] || 0);
    if (src.settings) {
      base.settings.sound = src.settings.sound !== false;
      base.settings.shake = src.settings.shake !== false;
      base.settings.particles = src.settings.particles !== false;
      base.settings.reduce = src.settings.reduce === true;
    }
    if (Array.isArray(src.contracts) && src.contracts.length) {
      base.contracts = src.contracts.slice(0, 3).map((c, i) => ({
        uid: +c.uid || i + 1,
        kind: c.kind,
        label: String(c.label || "Contract"),
        need: +c.need || 0,
        got: +c.got || 0,
        needF: c.needF ? asBig(c.needF) : null,
        gotF: c.gotF ? asBig(c.gotF) : null,
        reward: String(c.reward || ""),
        pay: +c.pay || 1,
      }));
    }
    if (src.offline) base.offline = { seconds: +src.offline.seconds || 0, amount: String(src.offline.amount || "0") };
    if (src.acc) base.acc = { gamble: +src.acc.gamble || 0, cascade: +src.acc.cascade || 0, rift: +src.acc.rift || 0, lightning: +src.acc.lightning || 0 };
    return base;
  };

  const KEY = "veln.save.v1";
  const save = () => {
    try {
      S.lastSeen = Date.now();
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch { /* quota or private mode */ }
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      S = hydrate(JSON.parse(raw));
      const gap = S.lastSeen ? (Date.now() - S.lastSeen) / 1000 : 0;
      if (!S.offline && gap > 20) applyOffline(gap);
    } else S.rng = (Math.floor(Math.random() * 2 ** 31) ^ Date.now()) >>> 0 || 1;
  } catch {
    S = blank();
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    S.settings.reduce = true;
    S.settings.shake = false;
  }

  const resize = () => {
    const rect = view.parentElement.getBoundingClientRect();
    css.w = Math.max(1, rect.width);
    css.h = Math.max(1, rect.height);
    css.dpr = Math.min(window.devicePixelRatio || 1, css.w < 800 ? 1.5 : 2);
    view.width = Math.floor(css.w * css.dpr);
    view.height = Math.floor(css.h * css.dpr);
    pointer.x = css.w * 0.5;
    pointer.y = css.h * 0.56;
  };
  resize();
  bin.observer = new ResizeObserver(resize);
  bin.observer.observe(view.parentElement);

  const setPointer = (event) => {
    const rect = view.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
  };
  listen(hit, "pointerdown", (event) => {
    event.preventDefault();
    setPointer(event);
    audio.unlock();
    strike();
  });
  listen(window, "keydown", (event) => {
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (event.code !== "Space" && event.code !== "Enter") return;
    event.preventDefault();
    audio.unlock();
    pointer.x = css.w * 0.5;
    pointer.y = css.h * 0.56;
    strike();
  });
  listen(document, "visibilitychange", () => {
    if (document.hidden) {
      save();
      live.hiddenAt = Date.now();
      return;
    }
    audio.unlock();
    const gap = live.hiddenAt ? (Date.now() - live.hiddenAt) / 1000 : 0;
    if (gap > 20) applyOffline(gap);
    paintUI(true);
  });

  tabs.replaceChildren();
  for (const [id, label] of [["loops", "Loops"], ["sparks", "Sparks"], ["fate", "Fate"], ["echo", "Echo"]]) {
    const button = el("button", S.tab === id ? "on" : "", label);
    button.type = "button";
    listen(button, "click", () => {
      S.tab = id;
      [...tabs.children].forEach((node, i) => node.classList.toggle("on", ["loops", "sparks", "fate", "echo"][i] === S.tab));
      shopSig = "";
      renderShop();
    });
    tabs.append(button);
  }
  modes.replaceChildren();
  for (const mode of [1, 10, 100, "max"]) {
    const button = el("button", S.mode === mode ? "on" : "", mode === "max" ? "Max" : `×${mode}`);
    button.type = "button";
    listen(button, "click", () => {
      S.mode = mode;
      [...modes.children].forEach((node, i) => node.classList.toggle("on", [1, 10, 100, "max"][i] === S.mode));
      shopSig = "";
      renderShop();
    });
    modes.append(button);
  }
  const burstBtn = el("button", "buy go", "Burst well");
  burstBtn.type = "button";
  listen(burstBtn, "click", () => {
    audio.unlock();
    burstWell();
  });
  quick.replaceChildren(burstBtn);

  listen(panel, "click", (event) => {
    const node = event.target.closest("button");
    if (!node) return;
    audio.unlock();
    if (node.dataset.buy) buy(node.dataset.buy);
    else if (node.dataset.spark) buySpark(node.dataset.spark);
    else if (node.dataset.echo) buyEcho(node.dataset.echo);
    else if (node.dataset.relic) {
      S.relics.push(node.dataset.relic);
      if (S.relics.length > 3) S.relics.shift();
      S.draft = null;
      toast("Relic seated");
      checkAch();
      paintUI(true);
    } else if (node.dataset.skip) {
      S.draft = null;
      paintUI(true);
    } else if (node.dataset.reroll) {
      if (S.sparks < 2) toast("Need 2 sparks");
      else {
        S.sparks -= 2;
        const i = S.contracts.findIndex((c) => String(c.uid) === node.dataset.reroll);
        if (i >= 0) S.contracts[i] = makeContract();
        toast("Contract rewritten");
        paintUI(true);
      }
    } else if (node.dataset.ach) openAch();
    else if (node.dataset.collapse) collapse();
  });
  listen($("btn-sound"), "click", () => {
    S.settings.sound = !S.settings.sound;
    audio.unlock();
    audio.mute(!S.settings.sound);
    paintUI();
    save();
  });
  listen($("btn-gear"), "click", () => {
    audio.unlock();
    openSettings();
  });
  listen(modal, "click", (event) => {
    if (event.target === modal) closeModal();
  });

  let acc = 0;
  let last = performance.now();
  let uiAcc = 0;
  let saveAcc = 0;
  let measured = "";
  let mark = null;
  const frame = (now) => {
    if (live.dead) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!document.hidden) {
      if (juice.hitstop > 0 && !S.settings.reduce) juice.hitstop -= dt;
      else {
        acc += dt;
        let steps = 0;
        while (acc >= 1 / 30 && steps < 3) {
          step(1 / 30);
          acc -= 1 / 30;
          steps += 1;
        }
      }
      if (!mark) mark = { t: now, m: S.flux.m, e: S.flux.e };
      else if (now - mark.t >= 1000) {
        const delta = add(S.flux, { m: -mark.m, e: mark.e });
        if (delta.m > 0) measured = `${format(mulN(delta, 1000 / (now - mark.t)))}/s`;
        mark = { t: now, m: S.flux.m, e: S.flux.e };
      }
    }
    juice.trauma = Math.max(0, juice.trauma - dt * 1.65);
    juice.pulse = Math.max(0, juice.pulse - dt * 3.4);
    juice.flash = Math.max(0, juice.flash - dt * 2.2);
    for (const item of toasts) item.life -= dt;
    if (toasts.some((item) => item.life <= 0)) {
      for (let i = toasts.length - 1; i >= 0; i -= 1) if (toasts[i].life <= 0) toasts.splice(i, 1);
    }
    draw(S.time + acc);
    uiAcc += dt;
    if (uiAcc >= 0.2) {
      uiAcc = 0;
      paintUI();
    }
    saveAcc += dt;
    if (saveAcc >= 5) {
      saveAcc = 0;
      save();
    }
    live.raf = requestAnimationFrame(frame);
  };
  paintUI(true);
  live.raf = requestAnimationFrame(frame);
  window.__veln = {
    strike: (n = 1) => {
      for (let i = 0; i < n; i += 1) strike();
    },
    grant: (log) => {
      gain(fromLog(log));
      paintUI(true);
    },
    flux: () => format(S.flux),
  };
})();
