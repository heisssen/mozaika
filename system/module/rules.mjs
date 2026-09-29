/**
 * Pure rules of «Мозаїка: Нашвидкуруч!» (© 2025 Стасів Андрій, CC BY 4.0).
 * No Foundry APIs here — covered by unit tests.
 */

/** Entity creation tables (p.2): index 1–9, 0 → row 10. */
export const ENTITY_TABLES = {
  quality: ["самотнє", "яскраве", "енергійне", "класне", "впевнене", "розгублене", "кмітливе", "грубе", "мінливе", "грайливе"],
  form: ["гуманоїда", "відчуття", "робота", "тварину", "ляльку", "рослину", "предмет", "химеру", "примару", "явище"],
  trait: ["ніколи не *щось*", "колекціонує *щось*", "забуває про *щось*", "ненавидить *щось*", "шукає *щось*",
    "боїться *щось*", "вивчає *щось*", "любить *щось*", "створює *щось*", "мріє про *щось*"]
};
export const TABLE_KEYS = ["quality", "form", "trait"];

/** d10 face (1–10, where the die's "0" is 10) or a digit 0–9 → table row index 0–9. */
export function rowFromDigit(d) {
  const n = Number(d);
  if (!Number.isInteger(n) || n < 0 || n > 10) return null;
  return n === 0 || n === 10 ? 9 : n - 1;
}

/**
 * «Випадково визнач по останніх цифрах будь-чого» — take the last three digits of any string
 * (phone number, birthday, barcode) for the three tables, in order.
 * @returns {number[]|null} three row indices, or null if fewer than three digits
 */
export function rowsFromDigits(text) {
  const digits = String(text ?? "").replace(/\D/g, "");
  if (digits.length < 3) return null;
  return digits.slice(-3).split("").map(rowFromDigit);
}

/** «Сутність щось… й нагадує… до того ж…» → "самотнє, нагадує робота, любить красти". */
export function describeEntity({ quality, form, trait }) {
  return [quality, form && `нагадує ${form}`, trait].filter(Boolean).join(", ");
}

/**
 * Architect monologue length. Base 60 s; with «Розпад Мозаїки» each new Architect gets 5 s less
 * and the Mosaic is complete when it reaches 0.
 * @param {number} architectsSoFar  monologues already given (0 for the first)
 */
export function monologueSeconds(architectsSoFar, { base = 60, decay = false, step = 5 } = {}) {
  if (!decay) return base;
  return Math.max(0, base - step * architectsSoFar);
}

/** Five shards turn into one red shard («5 уламків на червоне»). */
export const RED_VALUE = 5;
export function exchangeRed({ shards = 0, red = 0 }) {
  if (shards < RED_VALUE) return null;
  return { shards: shards - RED_VALUE, red: red + 1 };
}
export function spendShard({ shards = 0, red = 0 }, { preferRed = false } = {}) {
  if (preferRed && red > 0) return { shards, red: red - 1, spent: "red" };
  if (shards > 0) return { shards: shards - 1, red, spent: "shard" };
  if (red > 0) return { shards, red: red - 1, spent: "red" };
  return null;
}

/** Seconds left on a timer from its end timestamp (ms) and the current time (ms). */
export function secondsLeft(endsAt, now) {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/**
 * Who writes whose Query (p.3): each player invents the Query of the entity of the player on their RIGHT.
 * @param {string[]} seats  player ids in seating order (clockwise)
 * @returns {Record<string,string>} author → recipient
 */
export function queryAssignments(seats) {
  const out = {};
  seats.forEach((p, i) => { out[p] = seats[(i + 1) % seats.length]; });
  return out;
}

/** Epilogue order: everyone once, starting after the current Architect. */
export function epilogueOrder(seats, architect) {
  const i = Math.max(0, seats.indexOf(architect));
  return [...seats.slice(i), ...seats.slice(0, i)];
}

/** Reasons a player «точно заслуговує отримати уламок» (p.5). */
export const AWARD_REASONS = ["monologue", "query", "laughter", "realities"];
/** Ways to use one (p.5). */
export const USE_REASONS = ["changeReality", "changeEntity", "emphasise"];
