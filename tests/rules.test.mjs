import { describe, it, expect } from "vitest";
import {
  ENTITY_TABLES, rowFromDigit, rowsFromDigits, describeEntity, monologueSeconds,
  exchangeRed, spendShard, secondsLeft, queryAssignments, epilogueOrder
} from "../system/module/rules.mjs";

describe("entity tables", () => {
  it("have ten rows each", () => Object.values(ENTITY_TABLES).forEach(t => expect(t).toHaveLength(10)));
  it("map digits and d10 faces to rows (0 and 10 are the last row)", () => {
    expect(rowFromDigit(1)).toBe(0);
    expect(rowFromDigit(9)).toBe(8);
    expect(rowFromDigit(0)).toBe(9);
    expect(rowFromDigit(10)).toBe(9);
    expect(rowFromDigit(11)).toBeNull();
  });
  it("use the last three digits of anything", () => {
    expect(rowsFromDigits("+380 67 123 45 78")).toEqual([4, 6, 7]);   // 5, 7, 8
    expect(rowsFromDigits("4820000 12 30 0")).toEqual([2, 9, 9]);     // 3, 0, 0
    expect(rowsFromDigits("12")).toBeNull();
  });
  it("reads like the zine's examples", () => {
    const e = { quality: ENTITY_TABLES.quality[0], form: ENTITY_TABLES.form[2], trait: "любить красти" };
    expect(describeEntity(e)).toBe("самотнє, нагадує робота, любить красти");
  });
});

describe("Architect timer", () => {
  it("is 60 s without decay", () => expect(monologueSeconds(7)).toBe(60));
  it("shrinks by 5 s per Architect with «Розпад Мозаїки»", () => {
    expect(monologueSeconds(0, { decay: true })).toBe(60);
    expect(monologueSeconds(3, { decay: true })).toBe(45);
    expect(monologueSeconds(12, { decay: true })).toBe(0);
    expect(monologueSeconds(20, { decay: true })).toBe(0);
  });
  it("counts seconds left", () => {
    expect(secondsLeft(10_000, 0)).toBe(10);
    expect(secondsLeft(10_000, 9_001)).toBe(1);
    expect(secondsLeft(10_000, 12_000)).toBe(0);
  });
});

describe("shards", () => {
  it("five turn into one red", () => {
    expect(exchangeRed({ shards: 7, red: 0 })).toEqual({ shards: 2, red: 1 });
    expect(exchangeRed({ shards: 4, red: 1 })).toBeNull();
  });
  it("are spent plain first unless red is asked for", () => {
    expect(spendShard({ shards: 2, red: 1 })).toEqual({ shards: 1, red: 1, spent: "shard" });
    expect(spendShard({ shards: 2, red: 1 }, { preferRed: true })).toEqual({ shards: 2, red: 0, spent: "red" });
    expect(spendShard({ shards: 0, red: 1 })).toEqual({ shards: 0, red: 0, spent: "red" });
    expect(spendShard({ shards: 0, red: 0 })).toBeNull();
  });
});

describe("table order", () => {
  it("each player writes the Query of the player on their right", () => {
    expect(queryAssignments(["a", "b", "c"])).toEqual({ a: "b", b: "c", c: "a" });
  });
  it("epilogue starts with the current Architect and goes round", () => {
    expect(epilogueOrder(["a", "b", "c", "d"], "c")).toEqual(["c", "d", "a", "b"]);
  });
});
