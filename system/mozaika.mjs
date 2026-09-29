/**
 * «Мозаїка: Нашвидкуруч!» — Foundry VTT system.
 * Game © 2025 Стасів Андрій «Дячок» (text & layout), illustrations Суцільний Максим — CC BY 4.0.
 * https://firstfloor.itch.io/mosaic
 */
import { EntityData } from "./module/data.mjs";
import { EntitySheet } from "./module/sheet.mjs";
import { MosaicPanel } from "./module/panel.mjs";
import { ID, registerState, initSocket, watchTimers, getState, userEntity, op } from "./module/state.mjs";
import * as rules from "./module/rules.mjs";
import { registerDiceSoNice } from "./module/dice-so-nice.mjs";

Hooks.once("init", () => {
  CONFIG.Actor.dataModels.entity = EntityData;
  CONFIG.Actor.trackableAttributes = { entity: { bar: [], value: ["shards", "red"] } };
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet(ID, EntitySheet, { types: ["entity"], makeDefault: true, label: "MOZ.Entity.Sheet" });
  registerState();
  registerDiceSoNice();
  document.fonts?.load("64px MozDisplay");
  Handlebars.registerHelper("moz-or", (...a) => a.slice(0, -1).some(Boolean));
  game.mozaika = { rules, open: () => MosaicPanel.open(), state: getState, op };
});

Hooks.once("ready", () => {
  initSocket();
  watchTimers();
  MosaicPanel.open();
  offerUkrainian();
});

/** The game is Ukrainian; offer the switch once to anyone whose client runs in another language. */
async function offerUkrainian() {
  if (game.i18n.lang === "uk") return;
  try { if (localStorage.getItem("mozaika.langOffered")) return; localStorage.setItem("mozaika.langOffered", "1"); } catch { return; }
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Мозаїка" }, classes: ["mozaika", "moz-dialog"],
    content: "<p>Перемкнути інтерфейс на українську?</p><p class='hint'>Switch the interface to Ukrainian? (Configure Settings → Core → Language)</p>",
    rejectClose: false
  });
  if (ok) { await game.settings.set("core", "language", "uk"); foundry.utils.debouncedReload(); }
}

/* A button in the left toolbar to bring the Mosaic back. */
Hooks.on("getSceneControlButtons", controls => {
  const tokens = controls.tokens ?? controls.token;
  if (!tokens?.tools) return;
  tokens.tools.mozaika = {
    name: "mozaika", title: "MOZ.Title", icon: "fa-solid fa-shapes", order: 60, button: true,
    onChange: () => MosaicPanel.open()
  };
});
