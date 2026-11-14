import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { app as slim } from "../src/slim";

vi.mock("../src/cache", () => ({
  getFileHash: () => "test-pdf",
  getCache: () => ({
    getScreenshot: async () => null,
    setScreenshot: async () => {},
  }),
}));

vi.mock("../src/rate-limit", () => ({
  getRLFactory: () => ({
    getLimiter: async () => ({ consume: async () => {} }),
  }),
}));

let full: Server;
beforeAll(async () => {
  const listen = vi
    .spyOn(express.application, "listen")
    .mockImplementation(function (this: Express) {
      full = createServer(this);
      return full;
    });
  try {
    await import("../src/index");
  } finally {
    listen.mockRestore();
  }
});

for (const name of ["slim", "full"]) {
  describe(`${name} screenshot page validation`, () => {
    const send = (pages: string | string[] | undefined) => {
      const req = request(name === "slim" ? slim : full).post("/screenshots");
      if (pages !== undefined) req.query({ pages });
      return req
        .field("config", JSON.stringify({ dpi: 36, ocrEnabled: false }))
        .attach("file", "./data/pe_deal_examples.pdf");
    };

    for (const pages of [
      "abc",
      "1garbage",
      "1.5",
      "0",
      "-1",
      "1,,2",
      "1,",
      "1e2",
      "NaN",
      "9007199254740992",
    ]) {
      it(`rejects malformed pages=${pages} with a client error`, async () => {
        const res = await send(pages);
        expect(res.status, res.text).toBe(400);
        expect(res.body.detail).toContain("pages");
      });
    }

    const valid: { pages?: string | string[]; expected: number[] }[] = [
      { expected: [1, 2] },
      { pages: "", expected: [1, 2] },
      { pages: "1", expected: [1] },
      { pages: "1,2", expected: [1, 2] },
      { pages: ["1", "2"], expected: [1, 2] },
      { pages: " 1, 2 ", expected: [1, 2] },
    ];
    for (const { pages, expected } of valid) {
      it(`preserves valid page selection: ${JSON.stringify(pages)}`, async () => {
        const res = await send(pages);
        expect(res.status, res.text).toBe(200);
        const result = res.text
          .trim()
          .split("\n")
          .map((line: string) => JSON.parse(line).page_number);
        expect(result).toEqual(expected);
      });
    }
  });
}
