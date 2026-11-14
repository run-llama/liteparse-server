import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Keep Redis serialization real while replacing only its external transport.
vi.mock("ioredis", () => ({
  default: class {
    private data = new Map<string, string>();
    async setex(key: string, _seconds: number, value: string) {
      this.data.set(key, value);
    }
    async get(key: string) {
      return this.data.get(key) ?? null;
    }
    on() {}
  },
}));

vi.mock("../src/rate-limit", () => ({
  getRLFactory: () => ({
    getLimiter: async () => ({ consume: async () => {} }),
  }),
}));

let server: Server;

beforeEach(() => {
  vi.stubEnv("REDIS_URI", "redis://localhost:6379");
  vi.stubEnv("REDIS_PASSWORD", "test-only");
});

beforeAll(async () => {
  // The full server starts listening on import. Use its real application
  // without binding its fixed port; supertest supplies an ephemeral listener.
  const listen = vi
    .spyOn(express.application, "listen")
    .mockImplementation(function (this: Express) {
      server = createServer(this);
      return server;
    });
  try {
    await import("../src/index");
  } finally {
    listen.mockRestore();
  }
});

describe("cached screenshot responses", () => {
  for (const pages of [undefined, "1"]) {
    it(`returns identical NDJSON on cache miss and hit (pages=${pages ?? "all"})`, async () => {
      const send = () => {
        const req = request(server).post("/screenshots");
        if (pages) req.query({ pages });
        return req
          .field("config", JSON.stringify({ dpi: 36, ocrEnabled: false }))
          .attach("file", "./data/pe_deal_examples.pdf");
      };
      const fresh = await send();
      const cached = await send();
      expect(fresh.status, fresh.text).toBe(200);
      expect(cached.status, cached.text).toBe(200);
      expect(fresh.headers["content-type"]).toContain("application/x-ndjson");
      expect(cached.headers["content-type"]).toBe(
        fresh.headers["content-type"],
      );
      expect(cached.text).toBe(fresh.text);
      const screenshots = cached.text
        .trim()
        .split("\n")
        .map((line: string) => JSON.parse(line));
      expect(screenshots).toHaveLength(pages ? 1 : 2);
      for (const [index, shot] of screenshots.entries()) {
        expect(shot).toMatchObject({
          index,
          page_number: index + 1,
          mimetype: "image/png",
        });
        expect(shot.width).toBeGreaterThan(0);
        expect(shot.height).toBeGreaterThan(0);
        expect(Buffer.from(shot.data, "base64").subarray(0, 8)).toEqual(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        );
      }
    });
  }
});
