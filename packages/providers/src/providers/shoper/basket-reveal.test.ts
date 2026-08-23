import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../../logger.ts";
import type { LogRecord, Logger } from "../../logger.ts";
import { parseBasketWarning, parseShoperList, parseShoperPages, extractWarning, revealVariant, buildOptionCombos } from "./basket-reveal.ts";

interface Capture {
  readonly records: LogRecord[];
  readonly logger: Logger;
}

function capturingLogger(): Capture {
  const records: LogRecord[] = [];
  return {
    records,
    logger: createLogger((record) => {
      records.push(record);
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const DOMAIN = "sklepskolim.pl";

describe("extractWarning", () => {
  it("extracts the decoded warning from a raw json body", () => {
    const capture = capturingLogger();
    const raw =
      '{"basket":{},"_flash_messenger":{"error":[],"warning":["Aktualnie dost\u0119pna ilo\u015b\u0107 to: Kubek SKOLIM - 13 szt. ."],"info":[],"success":[]}}';
    const warning = extractWarning(raw, capture.logger);
    expect(warning).toBe("Aktualnie dostępna ilość to: Kubek SKOLIM - 13 szt. .");
    expect(parseBasketWarning(warning ?? "")).toBe(13);
    expect(capture.records).toHaveLength(0);
  });

  it("returns null when the flash messenger is missing", () => {
    const capture = capturingLogger();
    expect(extractWarning('{"basket":{}}', capture.logger)).toBeNull();
    expect(capture.records).toHaveLength(0);
  });

  it("returns null and logs a warning when the body is not valid json", () => {
    const capture = capturingLogger();
    expect(extractWarning("not json", capture.logger)).toBeNull();
    expect(capture.records).toHaveLength(1);
    expect(capture.records[0]?.level).toBe("warn");
    expect(capture.records[0]?.message).toBe("basketreveal.put response parse failed");
  });
});

describe("revealVariant", () => {
  it("logs a warning when the add response is not valid json", async () => {
    const capture = capturingLogger();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => "not-json",
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await revealVariant("sklepskolim.pl", 47, capture.logger);
    expect(result).toBeNull();
    expect(
      capture.records.some((record) => record.message === "basketreveal.add response parse failed"),
    ).toBe(true);
  });

  it("logs a warning when the basket add fails", async () => {
    const capture = capturingLogger();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        headers: { get: () => null },
        text: async () => '{"message":"wybierz wariant"}',
      }),
    );
    const result = await revealVariant("sklepskolim.pl", 47, capture.logger);
    expect(result).toBeNull();
    expect(
      capture.records.some((record) => record.message === "basketreveal failed"),
    ).toBe(true);
  });

  it("logs a debug record when the cleanup delete fails", async () => {
    const capture = capturingLogger();
    const addBody = '{"added":[{"id":596940,"name":"Kubek"}]}';
    const putBody =
      '{"basket":{},"_flash_messenger":{"warning":["Aktualnie dost\u0119pna ilo\u015b\u0107 to: Kubek - 13 szt. ."]}}';
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => "Shop5=abc" },
          text: async () => addBody,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => putBody,
        })
        .mockRejectedValueOnce(new Error("delete network down")),
    );
    const result = await revealVariant("sklepskolim.pl", 47, capture.logger);
    expect(result).toBe(13);
    expect(
      capture.records.some((record) => record.message === "basketreveal.cleanup failed"),
    ).toBe(true);
  });

  it("blocks and logs when the basket add hits a cloudflare challenge", async () => {
    const capture = capturingLogger();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: () => null },
        text: async () => "<title>Verifying your connection...</title>",
      }),
    );
    const result = await revealVariant("sklepskolim.pl", 47, capture.logger);
    expect(result).toBeNull();
    expect(
      capture.records.some((record) => record.message === "basketreveal.challenge blocked"),
    ).toBe(true);
  });

  it("blocks and logs when the basket put hits a cloudflare challenge", async () => {
    const capture = capturingLogger();
    const addBody = '{"added":[{"id":596940,"name":"Kubek"}]}';
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => "Shop5=abc" },
          text: async () => addBody,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 429,
          headers: { get: () => null },
          text: async () => "<title>Verifying your connection...</title>",
        }),
    );
    const result = await revealVariant("sklepskolim.pl", 47, capture.logger);
    expect(result).toBeNull();
    expect(
      capture.records.some((record) => record.message === "basketreveal.challenge blocked"),
    ).toBe(true);
  });
});

describe("buildOptionCombos", () => {
  it("builds a single combo from one group", () => {
    const combos = buildOptionCombos([
      { id: 59, name: "Rozmiar", values: [{ id: "472", name: "XL" }] },
    ]);
    expect(combos).toHaveLength(1);
    expect(combos[0]?.options).toEqual({ "59": "472" });
    expect(combos[0]?.label).toBe("Rozmiar: XL");
  });

  it("builds the cartesian product across groups", () => {
    const combos = buildOptionCombos([
      { id: 1, name: "Rozmiar", values: [{ id: "s", name: "S" }, { id: "m", name: "M" }] },
      { id: 2, name: "Kolor", values: [{ id: "cz", name: "czarny" }] },
    ]);
    expect(combos).toHaveLength(2);
    expect(combos[0]?.label).toBe("Rozmiar: S, Kolor: czarny");
    expect(combos[1]?.label).toBe("Rozmiar: M, Kolor: czarny");
  });

  it("returns an empty array for a malformed configuration", () => {
    expect(buildOptionCombos(null)).toEqual([]);
    expect(buildOptionCombos([{ id: 1, values: [] }])).toEqual([]);
    expect(buildOptionCombos("nope")).toEqual([]);
  });
});

describe("parseBasketWarning", () => {
  it("reads the exact quantity from the warning", () => {
    const warning =
      "Ilość produktów w koszyku przekracza dostępny stan magazynowy. <br /> Aktualnie dostępna ilość to: Kubek SKOLIM Wyglądasz Idealnie- granatowy - 13 szt. .";
    expect(parseBasketWarning(warning)).toBe(13);
  });

  it("returns null for a generic warning without a number", () => {
    expect(
      parseBasketWarning("Ilość produktów w koszyku przekracza dostępny stan magazynowy."),
    ).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseBasketWarning("")).toBeNull();
  });
});

describe("parseShoperPages", () => {
  it("reads the total page count", () => {
    expect(parseShoperPages({ list: [], count: 200, pages: 20 })).toBe(20);
  });

  it("returns null when pages is missing", () => {
    expect(parseShoperPages({ list: [] })).toBeNull();
    expect(parseShoperPages(null)).toBeNull();
  });
});

describe("parseShoperList", () => {
  const LIST = {
    list: [
      {
        id: 35,
        stockId: 43,
        name: "Bluza SKOLIM",
        url: "https://sklepskolim.pl/pl/p/bluza/35",
        can_buy: true,
        price: { gross: { base_float: 200, final_float: 179 } },
      },
      {
        id: 36,
        stockId: 44,
        name: "Kubek SKOLIM",
        url: "https://sklepskolim.pl/pl/p/kubek/36",
        can_buy: false,
        price: { gross: { base_float: 40, final_float: 40 } },
      },
    ],
  };

  it("maps products and their stock variants", () => {
    const products = parseShoperList(LIST, DOMAIN);
    expect(products).toHaveLength(2);
    const bluza = products[0];
    expect(bluza?.id).toBe("35");
    expect(bluza?.title).toBe("Bluza SKOLIM");
    const variant = bluza?.variants[0];
    expect(variant?.id).toBe("43");
    expect(variant?.available).toBe(true);
    expect(variant?.quantity).toBeNull();
    expect(variant?.price.amount).toBe(179);
    expect(variant?.regularPrice?.amount).toBe(200);
  });

  it("keeps quantity masked and marks can_buy false as unavailable", () => {
    const kubek = parseShoperList(LIST, DOMAIN)[1];
    expect(kubek?.variants[0]?.available).toBe(false);
    expect(kubek?.variants[0]?.regularPrice).toBeNull();
    expect(kubek?.variants[0]?.price.amount).toBe(40);
  });

  it("returns an empty array for invalid payloads", () => {
    expect(parseShoperList(null, DOMAIN)).toEqual([]);
    expect(parseShoperList({ noList: true }, DOMAIN)).toEqual([]);
    expect(parseShoperList("nope", DOMAIN)).toEqual([]);
  });

  it("skips malformed products", () => {
    const products = parseShoperList({ list: [null, "bad", { id: 1 }] }, DOMAIN);
    expect(products).toEqual([]);
  });
});
