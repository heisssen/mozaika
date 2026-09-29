/**
 * The shared Mosaic: phase, Quest, seats, Architect, current Dimension and its Realities, the timer,
 * options, safety. Stored in a world setting; every change runs on the GM through `op()` so players
 * (who can't write world settings or other players' actors) take part equally.
 */
import { monologueSeconds, epilogueOrder, exchangeRed, spendShard, queryAssignments } from "./rules.mjs";

export const ID = "mozaika";
const CHANNEL = `system.${ID}`;
const EPILOGUE_SECONDS = 30;

export const DEFAULT_STATE = {
  phase: "setup",                       // setup → play → epilogue → done
  quest: "", questHistory: [],
  seats: [],                            // entity uuids, clockwise
  architect: "", nextArchitect: "", architects: 0,
  dimension: { n: 0, title: "", realities: [] },
  timer: { kind: "", endsAt: 0, duration: 0, paused: false, left: 0 },
  options: { base: 60, decay: false, step: 5, startShards: 3, scenes: true },
  safety: { ok: "", notOk: "" },
  epilogue: { queue: [], index: 0 },
  chronicle: ""
};

export const getState = () => foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_STATE), game.settings.get(ID, "state") ?? {});
const setState = s => game.settings.set(ID, "state", s);
const now = () => game.time.serverTime ?? Date.now();
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = t => foundry.utils.escapeHTML(String(t ?? ""));

export function registerState() {
  game.settings.register(ID, "state", {
    scope: "world", config: false, type: Object, default: DEFAULT_STATE,
    onChange: () => Hooks.callAll("mozaikaStateChanged", getState())
  });
  game.settings.register(ID, "timerSound", {
    name: "MOZ.Setting.TimerSound", hint: "MOZ.Setting.TimerSoundHint", scope: "client", config: true, type: Boolean, default: true
  });
}

/* ------------------------------------------------------------ */
/*  Socket: run operations on the active GM                       */
/* ------------------------------------------------------------ */

const pending = new Map();

export function initSocket() {
  game.socket.on(CHANNEL, async msg => {
    if (msg.type === "result") {
      const p = pending.get(msg.id);
      if (p && msg.to === game.user.id) { pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result); }
      return;
    }
    if (msg.type === "consent" && msg.to === game.user.id) return answerConsent(msg);
    if (msg.type === "consentReply") { const p = pending.get(msg.id); if (p) { pending.delete(msg.id); p.resolve(msg.ok); } return; }
    if (msg.type !== "op" || !game.users.activeGM?.isSelf) return;
    let result = null, error = null;
    try { result = await runOp(msg.name, msg.data, game.users.get(msg.from)); }
    catch (err) { console.error(err); error = err.message; }
    game.socket.emit(CHANNEL, { type: "result", id: msg.id, to: msg.from, result, error });
  });
}

/** Run an operation as GM (locally if this user is the active GM). */
export async function op(name, data = {}) {
  if (game.users.activeGM?.isSelf) return runOp(name, data, game.user);
  if (!game.users.activeGM) { ui.notifications.warn("MOZ.Notify.NoGM", { localize: true }); return null; }
  const id = foundry.utils.randomID();
  const p = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  game.socket.emit(CHANNEL, { type: "op", id, name, data, from: game.user.id });
  return p;
}

/* ------------------------------------------------------------ */
/*  Consent: changing someone else's entity needs their OK (p.5)  */
/* ------------------------------------------------------------ */

function ownerOf(actor) {
  return game.users.find(u => !u.isGM && u.active && actor.testUserPermission(u, "OWNER"))
    ?? game.users.find(u => u.active && actor.testUserPermission(u, "OWNER"));
}

async function askConsent(actor, text, fromName) {
  const owner = ownerOf(actor);
  if (!owner) return true;
  if (owner.isSelf) return consentDialog(actor, text, fromName);
  const id = foundry.utils.randomID();
  const p = new Promise(resolve => pending.set(id, { resolve }));
  game.socket.emit(CHANNEL, { type: "consent", id, to: owner.id, actorUuid: actor.uuid, text, fromName });
  return Promise.race([p, new Promise(r => setTimeout(() => r(false), 60000))]);
}

async function answerConsent({ id, actorUuid, text, fromName }) {
  const actor = await fromUuid(actorUuid);
  const ok = await consentDialog(actor, text, fromName);
  game.socket.emit(CHANNEL, { type: "consentReply", id, ok });
}

function consentDialog(actor, text, fromName) {
  return foundry.applications.api.DialogV2.confirm({
    window: { title: "MOZ.Consent.Title", icon: "fa-solid fa-hand" },
    classes: ["mozaika", "moz-dialog"],
    content: `<p>${L("MOZ.Consent.Ask", { from: esc(fromName), name: esc(actor?.name) })}</p><blockquote>${esc(text)}</blockquote>`,
    rejectClose: false
  });
}

/* ------------------------------------------------------------ */
/*  Chat & chronicle                                              */
/* ------------------------------------------------------------ */

export function card(kind, title, body, { actor = null, icon = "fa-shapes" } = {}) {
  return ChatMessage.create({
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : { alias: L("MOZ.Title") },
    content: `<div class="moz-card moz-${kind}"><h3><i class="fa-solid ${icon}"></i> ${title}</h3>${body ? `<div class="moz-body">${body}</div>` : ""}</div>`,
    flags: { [ID]: { kind } }
  });
}

async function chronicle(s) {
  let j = s.chronicle ? game.journal.get(s.chronicle) : null;
  if (!j) {
    j = await JournalEntry.create({
      name: L("MOZ.Chronicle.Name", { date: new Date().toLocaleDateString("uk-UA") }),
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }
    });
    s.chronicle = j.id;
  }
  return j;
}

function realitiesHtml(dim) {
  const items = dim.realities.map(r => `<li class="${r.crossed ? "crossed" : ""} ${r.architect ? "arch" : ""}">${r.crossed ? `<s>${esc(r.text)}</s>` : esc(r.text)} <span class="by">— ${esc(r.by)}</span></li>`).join("");
  return `<ol class="moz-realities">${items || `<li class="empty">${L("MOZ.Dimension.Empty")}</li>`}</ol>`;
}

async function archiveDimension(s) {
  const d = s.dimension;
  if (!d.n) return;
  const j = await chronicle(s);
  const name = L("MOZ.Dimension.PageName", { n: d.n, title: d.title || "…" });
  const content = `<p class="moz-arch">${L("MOZ.Dimension.ArchitectWas", { name: esc(fromUuidSync(s.architect)?.name ?? "?") })}</p>${realitiesHtml(d)}`;
  const page = j.pages.find(p => p.getFlag(ID, "dimension") === d.n);
  if (page) await page.update({ name, "text.content": content });
  else await j.createEmbeddedDocuments("JournalEntryPage", [{ name, type: "text", text: { content }, sort: d.n * 100, flags: { [ID]: { dimension: d.n } } }]);
}

/* ------------------------------------------------------------ */
/*  Operations                                                    */
/* ------------------------------------------------------------ */

const actorOf = uuid => (uuid ? fromUuidSync(uuid) : null);
const userEntity = user => (user.character?.type === "entity" ? user.character : null)
  ?? game.actors.find(a => a.type === "entity" && a.testUserPermission(user, "OWNER") && !user.isGM);

async function runOp(name, data, user) {
  const s = foundry.utils.deepClone(getState());
  const who = user?.name ?? "?";
  const self = userEntity(user);
  const O = OPS[name];
  if (!O) throw new Error(`unknown op ${name}`);
  const out = await O(s, data, { user, who, self });
  if (out !== false) await setState(s);
  return out;
}

const OPS = {
  /* ---------- setup ---------- */
  async options(s, d) { Object.assign(s.options, d); },
  async safety(s, d) { Object.assign(s.safety, d); },

  async createEntity(s, d, { user }) {
    const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER };
    if (user && !user.isGM) ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    const a = await Actor.create({
      name: d.name || L("MOZ.Entity.NewName"), type: "entity", img: d.img || "systems/mozaika/assets/ui/entity.svg",
      ownership, system: { quality: d.quality ?? "", form: d.form ?? "", trait: d.trait ?? "", look: d.look ?? "" },
      prototypeToken: { actorLink: true, name: d.name || "", disposition: 1 }
    });
    // «Моя сутність»: the GM can play too (there is no GM in Mozaika — the host is just another player).
    if (user && (d.mine || !user.isGM) && !user.character) await user.update({ character: a.id });
    s.seats.push(a.uuid);
    return a.uuid;
  },
  async seat(s, d) {
    const i = s.seats.indexOf(d.uuid);
    if (d.remove) { if (i >= 0) s.seats.splice(i, 1); return; }
    if (i < 0) { s.seats.push(d.uuid); return; }
    const j = Math.max(0, Math.min(s.seats.length - 1, i + d.delta));
    [s.seats[i], s.seats[j]] = [s.seats[j], s.seats[i]];
  },
  async writeQuery(s, d, { who }) {
    const a = actorOf(d.uuid);
    if (!a) return false;
    const queries = a.system.query ? [...a.system.queries, { text: a.system.query, answer: d.answer ?? "", date: today() }] : a.system.queries;
    await a.update({ "system.query": d.text, "system.queryFrom": who, "system.queries": queries });
    if (s.phase !== "setup") await card("query", L("MOZ.Query.Rewritten", { name: esc(a.name) }), `<blockquote>${esc(d.text)}</blockquote>`, { actor: a, icon: "fa-question" });
    return false;
  },
  async quest(s, d, { who }) {
    if (s.quest && s.quest !== d.text) s.questHistory.push({ text: s.quest, by: who, date: today() });
    s.quest = d.text;
    if (s.phase === "play") await card("quest", L("MOZ.Quest.Changed"), `<blockquote>${esc(d.text)}</blockquote>`, { icon: "fa-compass" });
  },
  async start(s) {
    if (!s.seats.length) throw new Error(L("MOZ.Notify.NoEntities"));
    for (const u of s.seats) {
      const a = actorOf(u);
      if (a) await a.update({ "system.shards": s.options.startShards, "system.red": 0 });
    }
    s.phase = "play";
    s.architects = 0;
    await chronicle(s);
    const j = game.journal.get(s.chronicle);
    const cast = s.seats.map(u => actorOf(u)).filter(Boolean)
      .map(a => `<li><strong>${esc(a.name)}</strong> — ${esc(a.system.summary)}${a.system.query ? `<br><em>${L("MOZ.Query.Label")}: ${esc(a.system.query)}</em>` : ""}</li>`).join("");
    await j.createEmbeddedDocuments("JournalEntryPage", [{
      name: L("MOZ.Chronicle.Cast"), type: "text", sort: 0,
      text: { content: `<p><strong>${L("MOZ.Quest.Label")}:</strong> ${esc(s.quest || "…")}</p><ul>${cast}</ul>` }
    }]);
    await card("start", L("MOZ.Phase.StartCard"), `<p><strong>${L("MOZ.Quest.Label")}:</strong> ${esc(s.quest || "…")}</p><p>${L("MOZ.Phase.StartHint", { n: s.options.startShards })}</p>`, { icon: "fa-play" });
  },

  /* ---------- dimensions & the Architect ---------- */
  async newDimension(s, d, { self }) {
    await archiveDimension(s);
    const architect = d.architect || s.nextArchitect || self?.uuid || s.seats[0];
    s.dimension = { n: s.dimension.n + 1, title: d.title ?? "", realities: [] };
    s.architect = architect;
    s.nextArchitect = "";
    s.timer = { kind: "", endsAt: 0, duration: 0, paused: false, left: 0 };
    const a = actorOf(architect);
    if (s.options.scenes) {
      const scene = await Scene.create({
        name: L("MOZ.Dimension.SceneName", { n: s.dimension.n }), navigation: true, backgroundColor: "#e98fb0",
        width: 3000, height: 2000, padding: 0, grid: { type: 0 }, tokenVision: false,
        flags: { [ID]: { dimension: s.dimension.n } }
      });
      await scene.activate();
    }
    await card("dimension", L("MOZ.Dimension.New", { n: s.dimension.n }), L("MOZ.Dimension.ArchitectIs", { name: esc(a?.name ?? "?") }), { actor: a, icon: "fa-door-open" });
  },
  async passArchitect(s, d) { s.nextArchitect = d.uuid; },
  async dimensionTitle(s, d) { s.dimension.title = d.title; },

  async startMonologue(s) {
    const secs = monologueSeconds(s.architects, s.options);
    if (secs <= 0) { await OPS.complete(s, {}, {}); return; }
    s.timer = { kind: "monologue", endsAt: now() + secs * 1000, duration: secs, paused: false, left: 0 };
    s.architects += 1;
    const a = actorOf(s.architect);
    await card("monologue", L("MOZ.Timer.MonologueStart", { name: esc(a?.name ?? "?"), n: secs }), L("MOZ.Timer.MonologueRule"), { actor: a, icon: "fa-microphone" });
  },
  async pause(s, d) {
    const t = s.timer;
    if (!t.kind) return false;
    if (d.pause && !t.paused) { t.left = Math.max(0, t.endsAt - now()); t.paused = true; }
    else if (!d.pause && t.paused) { t.endsAt = now() + t.left; t.paused = false; }
  },
  async timerDone(s) {
    const t = s.timer;
    if (!t.kind || t.paused || t.endsAt > now() + 250) return false;
    const kind = t.kind;
    s.timer = { kind: "", endsAt: 0, duration: 0, paused: false, left: 0 };
    if (kind === "monologue") {
      // «Гравець точно заслуговує отримати уламок за монолог Архітектора» (p.5)
      const a = actorOf(s.architect);
      if (a) await a.update({ "system.shards": a.system.shards + 1 });
      await card("timer", L("MOZ.Timer.MonologueEnd", { name: esc(a?.name ?? "?") }), L("MOZ.Timer.MonologueEndHint"), { actor: a, icon: "fa-bell" });
    } else if (kind === "epilogue") {
      await OPS.nextEpilogue(s, {}, {});
    }
  },

  /* ---------- realities ---------- */
  async addReality(s, d, { self, who }) {
    const text = String(d.text ?? "").trim();
    if (!text || !s.dimension.n) return false;
    const monologue = s.timer.kind === "monologue" && !s.timer.paused;
    const isArchitect = self?.uuid === s.architect || d.asArchitect;
    if (monologue && !isArchitect) throw new Error(L("MOZ.Notify.OnlyArchitect"));
    s.dimension.realities.push({ id: foundry.utils.randomID(), text, by: self?.name ?? who, byUuid: self?.uuid ?? "", architect: monologue && isArchitect, crossed: false, ts: now() });
    await archiveDimension(s);
  },

  /* ---------- shards (p.5) ---------- */
  async award(s, d, { who, self }) {
    const a = actorOf(d.uuid);
    if (!a) return false;
    await a.update({ "system.shards": a.system.shards + 1 });
    await card("award", L("MOZ.Shard.Awarded", { name: esc(a.name) }), `${L(`MOZ.Shard.Reason.${d.reason}`)}${d.note ? ` — <em>${esc(d.note)}</em>` : ""}<span class="from">${L("MOZ.Shard.From", { who: esc(self?.name ?? who) })}</span>`, { actor: a, icon: "fa-gem" });
    return false;
  },
  async exchange(s, d) {
    const a = actorOf(d.uuid);
    const r = a && exchangeRed(a.system);
    if (!r) throw new Error(L("MOZ.Notify.NotEnoughShards"));
    await a.update({ "system.shards": r.shards, "system.red": r.red });
    await card("red", L("MOZ.Shard.Red", { name: esc(a.name) }), "", { actor: a, icon: "fa-gem" });
    return false;
  },
  async give(s, d) {
    const from = actorOf(d.from), to = actorOf(d.to);
    const r = from && spendShard(from.system);
    if (!r || !to) throw new Error(L("MOZ.Notify.NotEnoughShards"));
    await from.update({ "system.shards": r.shards, "system.red": r.red });
    await to.update({ [`system.${r.spent === "red" ? "red" : "shards"}`]: to.system[r.spent === "red" ? "red" : "shards"] + 1 });
    await card("give", L("MOZ.Shard.Given", { from: esc(from.name), to: esc(to.name) }), d.note ? `<em>${esc(d.note)}</em>` : "", { actor: from, icon: "fa-hand-holding-heart" });
    return false;
  },
  async useShard(s, d, { who }) {
    const a = actorOf(d.uuid);
    const r = a && spendShard(a.system, { preferRed: d.red });
    if (!r) throw new Error(L("MOZ.Notify.NotEnoughShards"));
    let body = "";
    if (d.purpose === "changeReality") {
      const real = s.dimension.realities.find(x => x.id === d.realityId);
      if (!real) return false;
      real.crossed = true;
      s.dimension.realities.push({ id: foundry.utils.randomID(), text: d.text, by: a.name, byUuid: a.uuid, architect: false, crossed: false, ts: now(), replaces: real.id });
      body = `<s>${esc(real.text)}</s><br>→ ${esc(d.text)}`;
      await archiveDimension(s);
    } else if (d.purpose === "changeEntity") {
      const target = actorOf(d.target) ?? a;
      if (target !== a) {
        const ok = await askConsent(target, d.text, a.name);
        if (!ok) { await card("refused", L("MOZ.Consent.Refused", { name: esc(target.name) }), "", { actor: target, icon: "fa-hand" }); return false; }
      }
      await target.update({ "system.changes": [...target.system.changes, { text: d.text, dimension: String(s.dimension.n), by: a.name, date: today() }] });
      body = `<strong>${esc(target.name)}</strong>: ${esc(d.text)}`;
    } else {
      body = esc(d.text);
    }
    await a.update({ "system.shards": r.shards, "system.red": r.red });
    await card("use", L(`MOZ.Shard.Use.${d.purpose}`, { name: esc(a.name) }), body, { actor: a, icon: r.spent === "red" ? "fa-fire" : "fa-wand-sparkles" });
  },

  /* ---------- the end (p.1, p.4) ---------- */
  async complete(s) {
    await archiveDimension(s);
    s.phase = "epilogue";
    const architect = s.seats.includes(s.architect) ? s.architect : s.seats[0];
    s.epilogue = { queue: epilogueOrder(s.seats, architect), index: -1 };
    await card("complete", L("MOZ.Phase.Complete"), L("MOZ.Phase.CompleteHint", { n: EPILOGUE_SECONDS }), { icon: "fa-flag-checkered" });
    await OPS.nextEpilogue(s, {}, {});
  },
  async nextEpilogue(s) {
    s.epilogue.index += 1;
    const u = s.epilogue.queue[s.epilogue.index];
    if (!u) {
      s.phase = "done";
      s.timer = { kind: "", endsAt: 0, duration: 0, paused: false, left: 0 };
      const j = await chronicle(s);
      const eps = s.seats.map(x => actorOf(x)).filter(Boolean).map(a => `<li><strong>${esc(a.name)}</strong>${a.system.epilogue ? ` — ${esc(a.system.epilogue)}` : ""}</li>`).join("");
      await j.createEmbeddedDocuments("JournalEntryPage", [{ name: L("MOZ.Chronicle.Epilogue"), type: "text", sort: 999999, text: { content: `<ul>${eps}</ul>` } }]);
      await card("done", L("MOZ.Phase.Done"), `@UUID[JournalEntry.${j.id}]{${esc(j.name)}}`, { icon: "fa-book" });
      return;
    }
    s.timer = { kind: "epilogue", endsAt: now() + EPILOGUE_SECONDS * 1000, duration: EPILOGUE_SECONDS, paused: false, left: 0 };
    const a = actorOf(u);
    await card("epilogue", L("MOZ.Phase.EpilogueOf", { name: esc(a?.name ?? "?") }), L("MOZ.Phase.EpilogueHint"), { actor: a, icon: "fa-feather" });
  },
  async epilogueText(s, d) { const a = actorOf(d.uuid); if (a) await a.update({ "system.epilogue": d.text }); return false; },
  async reset(s, d) {
    const keep = d.keepSeats ? s.seats : [];
    Object.assign(s, foundry.utils.deepClone(DEFAULT_STATE), { seats: keep, options: s.options, safety: s.safety });
  },

  /* ---------- safety ---------- */
  async xcard(s) {
    if (s.timer.kind && !s.timer.paused) { s.timer.left = Math.max(0, s.timer.endsAt - now()); s.timer.paused = true; }
    await ChatMessage.create({
      speaker: { alias: "X" },
      content: `<div class="moz-card moz-xcard"><h3><i class="fa-solid fa-xmark"></i> ${L("MOZ.Safety.XCard")}</h3><div class="moz-body">${L("MOZ.Safety.XCardHint")}</div></div>`
    });
  }
};

/** The active GM closes expired timers even when nobody has the panel open. */
export function watchTimers() {
  setInterval(() => {
    if (!game.users.activeGM?.isSelf) return;
    const t = getState().timer;
    if (t.kind && !t.paused && t.endsAt <= now() && watchTimers.last !== t.endsAt) {
      watchTimers.last = t.endsAt;
      op("timerDone");
    }
  }, 400);
}

/** Players' seats in order, as actors. */
export function seatActors(s = getState()) {
  return s.seats.map(u => fromUuidSync(u)).filter(Boolean);
}

/** Who writes whose Query: my entity → the entity on my right. */
export function myQueryTarget(s = getState()) {
  const mine = userEntity(game.user);
  if (!mine) return null;
  const map = queryAssignments(s.seats);
  return fromUuidSync(map[mine.uuid] ?? "") ?? null;
}

export { userEntity };
function today() { return new Date().toISOString().slice(0, 10); }
