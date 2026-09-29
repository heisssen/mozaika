/**
 * Build the compendium packs from code: entity RollTables (from rules.mjs), example entities, rules journal.
 * Writes JSON sources to packs-src/ then compiles LevelDB packs into system/packs/.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { ENTITY_TABLES, TABLE_KEYS } from "../system/module/rules.mjs";
import { RULES_PAGES } from "./rules-text.mjs";

const SRC = path.resolve("packs-src");
const OUT = path.resolve("system/packs");
const id = seed => crypto.createHash("sha1").update(seed).digest("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
const stats = { coreVersion: "14", systemId: "mozaika", systemVersion: "0.1.0", createdTime: 0, modifiedTime: 0, lastModifiedBy: null };

const TABLE_NAMES = { quality: "Сутність щось… (якість)", form: "…й нагадує… (форма)", trait: "…до того ж… (риса)" };
const tables = TABLE_KEYS.map(k => {
  const _id = id(`table-${k}`);
  return {
    _id, _key: `!tables!${_id}`, name: TABLE_NAMES[k], img: "icons/svg/d10-grey.svg", formula: "1d10", replacement: true, displayRoll: true,
    description: "«Мозаїка: Нашвидкуруч!» © 2025 Стасів Андрій, CC BY 4.0. Грань 0 на d10 — рядок 10.",
    results: ENTITY_TABLES[k].map((text, i) => {
      const rid = id(`table-${k}-${i}`);
      return { _id: rid, _key: `!tables.results!${_id}.${rid}`, type: "text", name: text, description: text, img: "icons/svg/d10-grey.svg", weight: 1, range: [i + 1, i + 1], drawn: false, _stats: stats };
    }),
    folder: null, sort: TABLE_KEYS.indexOf(k) * 100, ownership: { default: 0 }, flags: {}, _stats: stats
  };
});

const entity = (key, name, img, sys) => {
  const _id = id(`entity-${key}`);
  return {
    _id, _key: `!actors!${_id}`, name, type: "entity", img,
    system: { look: "", queryFrom: "", queries: [], changes: [], shards: 0, red: 0, epilogue: "", notes: "", ...sys },
    prototypeToken: { name, texture: { src: img }, actorLink: true, disposition: 1, displayName: 30 },
    items: [], effects: [], folder: null, sort: 0, ownership: { default: 0 }, flags: {}, _stats: stats
  };
};
const entities = [
  entity("tron", "ТРОН", "systems/mozaika/assets/entities/tron.webp", {
    quality: "самотнє", form: "робота", trait: "любить *красти*",
    look: "Телевізор з ручками та ніжками. Антена-«вуса», на екрані — шум і пульс.",
    query: "Чи зможе він налаштуватися на якийсь канал?",
    notes: "<p>Приклад із зіна «Мозаїка: Нашвидкуруч!» (ілюстрації — Суцільний Максим, CC BY 4.0).</p>"
  }),
  entity("mumi", "МУМІ-ТУМІ", "systems/mozaika/assets/entities/mumi-tumi.webp", {
    quality: "класне", form: "химеру", trait: "вивчає *реп*",
    look: "Круасан із великим підмальованим оком і страусиними ногами.",
    query: "Як далеко можна зайти?",
    notes: "<p>Приклад із зіна «Мозаїка: Нашвидкуруч!» (ілюстрації — Суцільний Максим, CC BY 4.0).</p>"
  })
];

const jid = id("rules");
const rules = [{
  _id: jid, _key: `!journal!${jid}`, name: "Мозаїка: Нашвидкуруч! — правила",
  pages: RULES_PAGES.map((p, i) => {
    const pid = id(`rules-${i}`);
    return { _id: pid, _key: `!journal.pages!${jid}.${pid}`, name: p.name, type: "text", title: { show: true, level: 1 },
      text: { format: 1, content: p.html }, sort: (i + 1) * 100, ownership: { default: -1 }, flags: {}, _stats: stats };
  }),
  folder: null, sort: 0, ownership: { default: 0 }, flags: {}, _stats: stats
}];

for (const [name, docs] of Object.entries({ tables, entities, rules })) {
  const dir = path.join(SRC, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const d of docs) fs.writeFileSync(path.join(dir, `${d._id}.json`), JSON.stringify(d, null, 2));
  fs.rmSync(path.join(OUT, name), { recursive: true, force: true });
  await compilePack(dir, path.join(OUT, name), { log: false });
  console.log(`packed ${name}: ${docs.length}`);
}
