/** Сутність sheet: the three tables, Query (with answered ones), changes, shards, epilogue, notes. */
import { ENTITY_TABLES, TABLE_KEYS, rowFromDigit, rowsFromDigits, describeEntity } from "./rules.mjs";
import { op, getState } from "./state.mjs";
import { useShardDialog } from "./panel.mjs";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const TextEditor = foundry.applications.ux.TextEditor.implementation;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

export class EntitySheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["mozaika", "moz-sheet"],
    position: { width: 520, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollTable: EntitySheet.#rollTable, fromDigits: EntitySheet.#fromDigits, rollAll: EntitySheet.#rollAll,
      answered: EntitySheet.#answered, useShard: EntitySheet.#useShard, changeSelf: EntitySheet.#changeSelf
    }
  };

  static PARTS = { body: { template: "systems/mozaika/templates/entity-sheet.hbs", scrollable: [".moz-scroll"] } };

  async _prepareContext(o) {
    const ctx = await super._prepareContext(o);
    const sys = this.actor.system;
    return Object.assign(ctx, {
      actor: this.actor, system: sys, editable: this.isEditable,
      tables: TABLE_KEYS.map(k => ({ key: k, label: `MOZ.Entity.Table.${k}`, value: sys[k], options: ENTITY_TABLES[k] })),
      summary: sys.summary,
      queries: [...sys.queries].reverse(),
      changes: [...sys.changes].reverse(),
      chips: Array.from({ length: Math.min(sys.shards, 15) }, (_, i) => ({ img: `systems/mozaika/assets/shards/Ulamok${(i % 3) + 1}.png` })),
      playing: getState().phase === "play",
      notesHTML: await TextEditor.enrichHTML(sys.notes, { relativeTo: this.actor })
    });
  }

  async #setTable(key, row, via) {
    const value = ENTITY_TABLES[key][row];
    await this.actor.update({ [`system.${key}`]: value });
    return value;
  }

  static async #rollTable(e, t) {
    const key = t.dataset.key;
    const roll = await new Roll("1d10").evaluate();
    const value = await this.#setTable(key, rowFromDigit(roll.total), "roll");
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${L(`MOZ.Entity.Table.${key}`)}: <strong>${value}</strong>` });
  }
  static async #rollAll() {
    const roll = await new Roll("3d10").evaluate();
    const faces = roll.dice[0].results.map(r => r.result);
    const vals = [];
    for (const [i, k] of TABLE_KEYS.entries()) vals.push(await this.#setTable(k, rowFromDigit(faces[i]), "roll"));
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `<strong>${describeEntity({ quality: vals[0], form: vals[1], trait: vals[2] })}</strong>` });
  }
  static async #fromDigits() {
    const text = this.element.querySelector("[name=digits]")?.value;
    const rows = rowsFromDigits(text);
    if (!rows) return ui.notifications.warn("MOZ.Entity.NeedDigits", { localize: true });
    for (const [i, k] of TABLE_KEYS.entries()) await this.#setTable(k, rows[i], "digits");
  }

  /** «Коли сутність остаточно вирішує, що знайшла відповідь на свій Запит» — archive it and write a new one. */
  static async #answered() {
    const sys = this.actor.system;
    const res = await DialogV2.prompt({
      window: { title: "MOZ.Query.AnsweredTitle", icon: "fa-solid fa-lightbulb" }, classes: ["mozaika", "moz-dialog"],
      content: `<p><em>${foundry.utils.escapeHTML(sys.query || "…")}</em></p>
        <div class="form-group"><label>${L("MOZ.Query.Answer")}</label><input name="a" type="text"></div>
        <div class="form-group"><label>${L("MOZ.Query.New")}</label><input name="q" type="text"></div>`,
      ok: { label: "MOZ.Query.Save", callback: (ev, b) => ({ answer: b.form.elements.a.value, text: b.form.elements.q.value }) },
      rejectClose: false
    });
    if (res) await op("writeQuery", { uuid: this.actor.uuid, text: res.text, answer: res.answer });
  }

  static #useShard() { return useShardDialog(this.actor.uuid); }
  static async #changeSelf() {
    const text = await DialogV2.prompt({
      window: { title: "MOZ.Entity.ChangeTitle", icon: "fa-solid fa-shuffle" }, classes: ["mozaika", "moz-dialog"],
      content: `<p class="hint">${L("MOZ.Entity.ChangeHint")}</p><input name="t" type="text" autofocus>`,
      ok: { label: "MOZ.Shard.Spend", callback: (ev, b) => b.form.elements.t.value }, rejectClose: false
    });
    if (text) return op("useShard", { uuid: this.actor.uuid, purpose: "changeEntity", target: this.actor.uuid, text }).catch(err => ui.notifications.warn(err.message));
  }
}
