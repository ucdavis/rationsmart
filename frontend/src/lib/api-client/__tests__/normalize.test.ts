import { describe, it, expect } from "vitest";
import { asRecord, listFrom, messageOf, numberField, stringField } from "../normalize";

describe("response normalisers (audit B-23)", () => {
  it("asRecord accepts plain objects only", () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord([1])).toBeNull();
    expect(asRecord(null)).toBeNull();
    expect(asRecord("x")).toBeNull();
  });

  it("typed field readers reject the wrong runtime type", () => {
    expect(stringField({ k: "v" }, "k")).toBe("v");
    expect(stringField({ k: 1 }, "k")).toBeUndefined();
    expect(numberField({ k: 2 }, "k")).toBe(2);
    expect(numberField({ k: NaN }, "k")).toBeUndefined();
    expect(numberField(new Error("x"), "status")).toBeUndefined();
    expect(numberField(Object.assign(new Error("x"), { status: 409 }), "status")).toBe(409);
    expect(messageOf({ message: "ok" })).toBe("ok");
    expect(messageOf(null)).toBeUndefined();
  });

  it("listFrom unwraps bare arrays and the first matching envelope key", () => {
    expect(listFrom([1, 2])).toEqual([1, 2]);
    expect(listFrom({ items: [3] }, "feeds", "items")).toEqual([3]);
    expect(listFrom({ feeds: [1], items: [2] }, "feeds", "items")).toEqual([1]);
    expect(listFrom({ feeds: "nope" }, "feeds")).toEqual([]);
    expect(listFrom(undefined, "feeds")).toEqual([]);
  });
});
