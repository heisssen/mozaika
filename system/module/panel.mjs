/**
 * The Mosaic panel — the table in the middle. Same window for everyone, reshaped by phase:
 * setup (safety, entities, queries, quest, options) → play (timer, Architect, dimension & realities,
 * shards) → epilogue (30 s each) → done (chronicle).
 */
import { ID, getState, op, seatActors, myQueryTarget, userEntity } from "./state.mjs";
import { secondsLeft, monologueSeconds, AWARD_REASONS, RED_VALUE } from "./rules.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const SHARD_IMG = n => `systems/mozaika/assets/shards/Ulamok${(n % 3) + 1}.png`;

export class MosaicPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;
  static open() { this.instance ??= new this(); return this.instance.render({ force: true }); }

  static DEFAULT_OPTIONS = {
    id: "mozaika-panel",
    classes: ["mozaika", "moz-panel"],
    window: { title: "MOZ.Title", icon: "fa-solid fa-shapes", resizable: true },
    position: { width: 560, height: 760, top: 60, left: 110 },
    actions: {
      createEntity: MosaicPanel.#createEntity, openEntity: MosaicPanel.#openEntity, seat: MosaicPanel.#seat,
      start: MosaicPanel.#start, newDimension: MosaicPanel.#newDimension, startMonologue: MosaicPanel.#startMonologue,
      pause: MosaicPanel.#pause, xcard: MosaicPanel.#xcard, award: MosaicPanel.#award, give: MosaicPanel.#give,
      useShard: MosaicPanel.#useShard, exchange: MosaicPanel.#exchange, changeReality: MosaicPanel.#changeReality,
      complete: MosaicPanel.#complete, nextEpilogue: MosaicPanel.#nextEpilogue, reset: MosaicPanel.#reset,
      openChronicle: MosaicPanel.#openChronicle
    }
  };

  static PARTS = { body: { template: "systems/mozaika/templates/panel.hbs", scrollable: [".moz-scroll"] } };

  async _prepareContext() {
    const s = getState();
    const seats = seatActors(s);
    const mine = userEntity(game.user);
    const architect = s.architect ? fromUuidSync(s.architect) : null;
    const target = myQueryTarget(s);
    const isArchitect = !!mine && mine.uuid === s.architect;
    const current = s.phase === "epilogue" ? fromUuidSync(s.epilogue.queue[s.epilogue.index] ?? "") : null;
    return {
      s, isGM: game.user.isGM, mine, isArchitect, architect, target, current,
      phase: { setup: s.phase === "setup", play: s.phase === "play", epilogue: s.phase === "epilogue", done: s.phase === "done" },
      seats: seats.map((a, i) => ({
        uuid: a.uuid, name: a.name, img: a.img, summary: a.system.summary, query: a.system.query, i,
        shards: a.system.shards, red: a.system.red, mine: a === mine, owner: a.isOwner, architect: a.uuid === s.architect,
        chips: Array.from({ length: Math.min(a.system.shards, 12) }, (_, k) => ({ img: SHARD_IMG(k + i) })),
        reds: Array.from({ length: a.system.red }, () => ({})),
        canExchange: a.isOwner && a.system.shards >= RED_VALUE
      })),
      realities: s.dimension.realities.map(r => ({ ...r })).reverse(),
      nextSeconds: monologueSeconds(s.architects, s.options),
      timerRunning: !!s.timer.kind,
      otherSeats: seats.filter(a => a !== mine).map(a => ({ uuid: a.uuid, name: a.name })),
      chronicle: s.chronicle ? game.journal.get(s.chronicle) : null,
      nextArchitect: s.nextArchitect ? fromUuidSync(s.nextArchitect)?.name : ""
    };
  }

  /** Other players' actions re-render the panel; keep whatever this user was typing. */
  async _preRender(ctx, opts) {
    await super._preRender(ctx, opts);
    const draft = this.element?.querySelector("form.moz-add-reality input")?.value;
    const focus = this.element?.contains(document.activeElement) ? document.activeElement : null;
    this._draft = { reality: draft, focusSel: focus?.dataset.op ? `[data-op="${focus.dataset.op}"]${focus.dataset.key ? `[data-key="${focus.dataset.key}"]` : ""}` : (focus?.name === "text" ? "form.moz-add-reality input" : null), focusVal: focus?.value };
  }

  _onRender(ctx, opts) {
    super._onRender(ctx, opts);
    const d = this._draft;
    if (d) {
      const r = this.element.querySelector("form.moz-add-reality input");
      if (r && d.reality) r.value = d.reality;
      const f = d.focusSel && this.element.querySelector(d.focusSel);
      if (f) { if (f.type !== "checkbox" && d.focusVal != null) f.value = d.focusVal; f.focus(); }
      this._draft = null;
    }
    this._stateHook ??= Hooks.on("mozaikaStateChanged", () => this.render());
    this._actorHook ??= Hooks.on("updateActor", a => { if (a.type === "entity") this.render(); });
    // Text fields that write to the shared state on change.
    this.element.querySelectorAll("[data-op]").forEach(el => el.addEventListener("change", () => {
      const v = el.type === "checkbox" ? el.checked : (el.type === "number" ? Number(el.value) : el.value);
      op(el.dataset.op, { [el.dataset.key ?? "text"]: v, uuid: el.dataset.uuid });
    }));
    const input = this.element.querySelector("form.moz-add-reality");
    input?.addEventListener("submit", ev => {
      ev.preventDefault();
      const f = ev.currentTarget.elements.text;
      const text = f.value.trim();
      if (!text) return;
      f.value = "";
      op("addReality", { text }).catch(err => ui.notifications.warn(err.message));
      setTimeout(() => this.element.querySelector("form.moz-add-reality input")?.focus(), 150);
    });
    this.#tick();
    clearInterval(this._timer);
    this._timer = setInterval(() => this.#tick(), 250);
  }

  /** Countdown without re-rendering (the GM-side watcher in state.mjs closes the timer). */
  #tick() {
    const s = getState();
    const el = this.element?.querySelector(".moz-timer");
    if (!el) return;
    const t = s.timer;
    const left = !t.kind ? 0 : (t.paused ? Math.ceil(t.left / 1000) : secondsLeft(t.endsAt, game.time.serverTime ?? Date.now()));
    el.querySelector(".secs").textContent = t.kind ? left : "—";
    el.style.setProperty("--p", t.kind && t.duration ? left / t.duration : 0);
    el.classList.toggle("urgent", !!t.kind && left <= 10);
    el.classList.toggle("paused", !!t.paused);
    if (t.kind && !t.paused && left <= 0 && this._dinged !== t.endsAt) {
      this._dinged = t.endsAt;
      if (game.settings.get(ID, "timerSound")) foundry.audio.AudioHelper.play({ src: "sounds/notify.wav", volume: 0.8 });
    }
  }

  async close(o) {
    clearInterval(this._timer);
    if (this._stateHook) Hooks.off("mozaikaStateChanged", this._stateHook);
    if (this._actorHook) Hooks.off("updateActor", this._actorHook);
    this._stateHook = this._actorHook = null;
    MosaicPanel.instance = null;
    return super.close(o);
  }

  /* ---------------- actions ---------------- */
  static async #createEntity(e, t) {
    const uuid = await op("createEntity", { mine: t.dataset.mine === "1" });
    const a = uuid ? await fromUuid(uuid) : null;
    a?.sheet.render({ force: true });
  }
  static async #openEntity(e, t) { (await fromUuid(t.closest("[data-uuid]").dataset.uuid))?.sheet.render({ force: true }); }
  static #seat(e, t) {
    const uuid = t.closest("[data-uuid]").dataset.uuid;
    return op("seat", { uuid, delta: Number(t.dataset.delta ?? 0), remove: t.dataset.remove === "1" });
  }
  static #start() { return op("start").catch(err => ui.notifications.warn(err.message)); }
  static async #newDimension() {
    const s = getState();
    const seats = seatActors(s);
    const def = s.nextArchitect || userEntity(game.user)?.uuid || seats[0]?.uuid;
    const options = seats.map(a => `<option value="${a.uuid}" ${a.uuid === def ? "selected" : ""}>${foundry.utils.escapeHTML(a.name)}</option>`).join("");
    const res = await DialogV2.prompt({
      window: { title: "MOZ.Dimension.NewTitle", icon: "fa-solid fa-door-open" }, classes: ["mozaika", "moz-dialog"],
      content: `<p class="moz-shout">${L("MOZ.Dimension.Shout")}</p>
        <div class="form-group"><label>${L("MOZ.Dimension.Architect")}</label><select name="a">${options}</select></div>
        <div class="form-group"><label>${L("MOZ.Dimension.TitleLabel")}</label><input name="t" type="text" placeholder="${L("MOZ.Dimension.TitlePlaceholder")}"></div>
        <p class="hint">${L("MOZ.Dimension.Hint")}</p>`,
      ok: { label: "MOZ.Dimension.Open", callback: (ev, b) => ({ architect: b.form.elements.a.value, title: b.form.elements.t.value }) },
      rejectClose: false
    });
    if (res) return op("newDimension", res);
  }
  static #startMonologue() { return op("startMonologue"); }
  static #pause(e, t) { return op("pause", { pause: t.dataset.pause === "1" }); }
  static #xcard() { return op("xcard"); }
  static async #award(e, t) {
    const uuid = t.closest("[data-uuid]").dataset.uuid;
    const opts = AWARD_REASONS.map(r => `<option value="${r}">${L(`MOZ.Shard.Reason.${r}`)}</option>`).join("");
    const res = await DialogV2.prompt({
      window: { title: "MOZ.Shard.AwardTitle", icon: "fa-solid fa-gem" }, classes: ["mozaika", "moz-dialog"],
      content: `<div class="form-group"><label>${L("MOZ.Shard.For")}</label><select name="r">${opts}</select></div>
        <div class="form-group"><label>${L("MOZ.Shard.Note")}</label><input name="n" type="text"></div>`,
      ok: { label: "MOZ.Shard.Award", callback: (ev, b) => ({ reason: b.form.elements.r.value, note: b.form.elements.n.value }) },
      rejectClose: false
    });
    if (res) return op("award", { uuid, ...res });
  }
  static async #give(e, t) {
    const from = t.closest("[data-uuid]").dataset.uuid;
    const others = seatActors().filter(a => a.uuid !== from);
    const res = await DialogV2.prompt({
      window: { title: "MOZ.Shard.GiveTitle", icon: "fa-solid fa-hand-holding-heart" }, classes: ["mozaika", "moz-dialog"],
      content: `<div class="form-group"><label>${L("MOZ.Shard.To")}</label><select name="to">${others.map(a => `<option value="${a.uuid}">${foundry.utils.escapeHTML(a.name)}</option>`).join("")}</select></div>
        <div class="form-group"><label>${L("MOZ.Shard.Note")}</label><input name="n" type="text"></div>`,
      ok: { label: "MOZ.Shard.Give", callback: (ev, b) => ({ to: b.form.elements.to.value, note: b.form.elements.n.value }) },
      rejectClose: false
    });
    if (res) return op("give", { from, ...res }).catch(err => ui.notifications.warn(err.message));
  }
  static async #useShard(e, t) {
    const uuid = t.closest("[data-uuid]").dataset.uuid;
    return useShardDialog(uuid);
  }
  static #exchange(e, t) { return op("exchange", { uuid: t.closest("[data-uuid]").dataset.uuid }).catch(err => ui.notifications.warn(err.message)); }
  static async #changeReality(e, t) {
    const mine = userEntity(game.user);
    if (!mine) return ui.notifications.warn("MOZ.Notify.NoEntity", { localize: true });
    const r = getState().dimension.realities.find(x => x.id === t.closest("[data-rid]").dataset.rid);
    const text = await DialogV2.prompt({
      window: { title: "MOZ.Reality.ChangeTitle", icon: "fa-solid fa-wand-sparkles" }, classes: ["mozaika", "moz-dialog"],
      content: `<p><s>${foundry.utils.escapeHTML(r.text)}</s></p><div class="form-group"><label>${L("MOZ.Reality.Now")}</label><input name="t" type="text" autofocus></div><p class="hint">${L("MOZ.Reality.ChangeHint")}</p>`,
      ok: { label: "MOZ.Shard.Spend", callback: (ev, b) => b.form.elements.t.value }, rejectClose: false
    });
    if (text) return op("useShard", { uuid: mine.uuid, purpose: "changeReality", realityId: r.id, text }).catch(err => ui.notifications.warn(err.message));
  }
  static async #complete() {
    const ok = await DialogV2.confirm({ window: { title: "MOZ.Phase.Complete" }, content: `<p>${L("MOZ.Phase.CompleteAsk")}</p>`, classes: ["mozaika", "moz-dialog"] });
    if (ok) return op("complete");
  }
  static #nextEpilogue() { return op("nextEpilogue"); }
  static async #reset() {
    const ok = await DialogV2.confirm({ window: { title: "MOZ.Phase.Reset" }, content: `<p>${L("MOZ.Phase.ResetAsk")}</p>`, classes: ["mozaika", "moz-dialog"] });
    if (ok) return op("reset", { keepSeats: true });
  }
  static #openChronicle() { const j = game.journal.get(getState().chronicle); j?.sheet.render({ force: true }); }
}

/** Spend a shard: change a reality (from the list), change an entity (consent if not yours), or emphasise. */
export async function useShardDialog(uuid) {
  const s = getState();
  const seats = seatActors(s);
  const me = fromUuidSync(uuid);
  const reals = s.dimension.realities.filter(r => !r.crossed);
  const content = `
    <div class="form-group"><label>${L("MOZ.Shard.How")}</label><select name="p">
      <option value="changeReality" ${reals.length ? "" : "disabled"}>${L("MOZ.Shard.Purpose.changeReality")}</option>
      <option value="changeEntity">${L("MOZ.Shard.Purpose.changeEntity")}</option>
      <option value="emphasise">${L("MOZ.Shard.Purpose.emphasise")}</option></select></div>
    <div class="form-group"><label>${L("MOZ.Shard.WhichReality")}</label><select name="r">${reals.map(r => `<option value="${r.id}">${foundry.utils.escapeHTML(r.text.slice(0, 70))}</option>`).join("")}</select></div>
    <div class="form-group"><label>${L("MOZ.Shard.WhichEntity")}</label><select name="e">${seats.map(a => `<option value="${a.uuid}" ${a === me ? "selected" : ""}>${foundry.utils.escapeHTML(a.name)}</option>`).join("")}</select></div>
    <div class="form-group"><label>${L("MOZ.Shard.What")}</label><input name="t" type="text" placeholder="${L("MOZ.Shard.WhatPlaceholder")}"></div>
    ${me?.system.red ? `<label class="checkbox"><input type="checkbox" name="red"> ${L("MOZ.Shard.UseRed")}</label>` : ""}
    <p class="hint">${L("MOZ.Shard.UseHint")}</p>`;
  const res = await DialogV2.prompt({
    window: { title: "MOZ.Shard.UseTitle", icon: "fa-solid fa-wand-sparkles" }, classes: ["mozaika", "moz-dialog"], content,
    ok: { label: "MOZ.Shard.Spend", callback: (ev, b) => {
      const f = b.form.elements;
      return { purpose: f.p.value, realityId: f.r.value, target: f.e.value, text: f.t.value, red: !!f.red?.checked };
    } },
    rejectClose: false
  });
  if (!res || !res.text?.trim()) return;
  return op("useShard", { uuid, ...res }).catch(err => ui.notifications.warn(err.message));
}
