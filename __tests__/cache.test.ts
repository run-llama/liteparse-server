import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { RedisCache } from "../src/cache";
import {
  LiteParseConfig,
  PageComplexityStats,
  ParsedPage,
  ScreenshotResult,
} from "@llamaindex/liteparse";

vi.mock("ioredis", async () => {
  return {
    default: vi.fn(
      class {
        path: string;
        private data: Map<
          string,
          { ttl: number; value: string; timestamp: number }
        >;

        constructor(
          path: string,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          _options: { enableOfflineQueue: boolean; password: string },
        ) {
          this.path = path;
          this.data = new Map();
        }
        setex = vi.fn(async (key: string, seconds: number, value: string) => {
          this.data.set(key, { ttl: seconds, value, timestamp: Date.now() });
        });
        get = vi.fn(async (key: string) => {
          const v = this.data.get(key);
          if (!v) return null;
          if (Date.now() - v.timestamp > v.ttl * 1000) return null;
          return v.value;
        });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        on = vi.fn((_event: string, _callback: (err: unknown) => void) => {});
      },
    ),
  };
});

const HASH = "fake_hash";
const PARSED_PAGES: ParsedPage[] = [
  {
    pageNum: 1,
    text: "hello",
    markdown: "hello",
    textItems: [],
    width: 100,
    height: 200,
  },
  {
    pageNum: 2,
    text: "bye",
    markdown: "bye",
    textItems: [],
    width: 150,
    height: 250,
  },
  {
    pageNum: 3,
    text: "salut",
    markdown: "salut",
    textItems: [],
    width: 130,
    height: 180,
  },
];
const PARSED_TEXT = "hello\nbye\nsalut";

const SCREENSHOTS: ScreenshotResult[] = [
  { imageBuffer: Buffer.from([0, 1, 2]), pageNum: 1, width: 100, height: 200 },
  { imageBuffer: Buffer.from([3, 4, 5]), pageNum: 2, width: 150, height: 250 },
  { imageBuffer: Buffer.from([6, 7, 8]), pageNum: 3, width: 130, height: 180 },
];

const COMPLEXITY: PageComplexityStats[] = [
  {
    pageNumber: 1,
    textLength: 1000,
    textCoverage: 0.8,
    hasSubstantialImages: false,
    imageBlockCount: 0,
    imageCoverage: 0,
    largestImageCoverage: 0,
    fullPageImage: false,
    isGarbled: false,
    pageArea: 612 * 792,
    needsOcr: false,
    reasons: [],
  },
  {
    pageNumber: 2,
    textLength: 0,
    textCoverage: 0,
    hasSubstantialImages: true,
    imageBlockCount: 1,
    imageCoverage: 0.95,
    largestImageCoverage: 0.95,
    fullPageImage: true,
    isGarbled: false,
    pageArea: 612 * 792,
    needsOcr: true,
    reasons: ["scanned"],
  },
];

const originalUri = process.env.REDIS_URI;
const originalPassword = process.env.REDIS_PASSWORD;

beforeEach(() => {
  process.env.REDIS_URI = "redis://localhost:6379";
  process.env.REDIS_PASSWORD = "secret"; // this is not a real password
});

afterEach(() => {
  if (originalUri === undefined) {
    delete process.env.REDIS_URI;
  } else {
    process.env.REDIS_URI = originalUri;
  }
  if (originalPassword === undefined) {
    delete process.env.REDIS_PASSWORD;
  } else {
    process.env.REDIS_PASSWORD = originalPassword;
  }
});

describe("Test caching for parsed content", () => {
  it("Test with pages, no config", async () => {
    const cache = new RedisCache();
    await cache.setParsed(HASH, false, false, undefined, PARSED_PAGES);
    const parsed = await cache.getParsed(HASH, false, false, undefined);
    expect(parsed).toBeTruthy();
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toStrictEqual(PARSED_PAGES);
    const noText = await cache.getParsed(HASH, true, false, undefined);
    expect(noText).toBeNull();
    const noConf = await cache.getParsed(HASH, false, false, { dpi: 180 });
    expect(noConf).toBeNull();
  });

  it("Test with pages, w/config", async () => {
    const cache = new RedisCache();
    const config: Partial<LiteParseConfig> = { targetPages: "1", dpi: 180 };
    await cache.setParsed(HASH, false, false, config, PARSED_PAGES);
    const parsed = await cache.getParsed(HASH, false, false, config);
    expect(parsed).toBeTruthy();
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toStrictEqual(PARSED_PAGES);
    const noText = await cache.getParsed(HASH, true, false, undefined);
    expect(noText).toBeNull();
    const diffConf = await cache.getParsed(HASH, false, false, { dpi: 180 });
    expect(diffConf).toBeNull();
    const noConf = await cache.getParsed(HASH, false, false, undefined);
    expect(noConf).toBeNull();
  });

  it("Test with text, no config", async () => {
    const cache = new RedisCache();
    await cache.setParsed(HASH, true, false, undefined, PARSED_TEXT);
    const parsed = await cache.getParsed(HASH, true, false, undefined);
    expect(parsed).toBeTruthy();
    expect(typeof parsed === "string").toBe(true);
    expect(parsed).toBe(PARSED_TEXT);
    const noText = await cache.getParsed(HASH, false, false, undefined);
    expect(noText).toBeNull();
    const noConf = await cache.getParsed(HASH, true, false, { dpi: 180 });
    expect(noConf).toBeNull();
  });

  it("Test with text, w/config", async () => {
    const cache = new RedisCache();
    const config: Partial<LiteParseConfig> = { targetPages: "1", dpi: 180 };
    await cache.setParsed(HASH, true, false, config, PARSED_TEXT);
    const parsed = await cache.getParsed(HASH, true, false, config);
    expect(parsed).toBeTruthy();
    expect(typeof parsed === "string").toBe(true);
    expect(parsed).toBe(PARSED_TEXT);
    const noText = await cache.getParsed(HASH, false, false, undefined);
    expect(noText).toBeNull();
    const diffConf = await cache.getParsed(HASH, true, false, { dpi: 180 });
    expect(diffConf).toBeNull();
    const noConf = await cache.getParsed(HASH, true, false, undefined);
    expect(noConf).toBeNull();
  });

  it("Test with markdown, no config", async () => {
    const cache = new RedisCache();
    await cache.setParsed(HASH, false, true, undefined, PARSED_TEXT);
    const parsed = await cache.getParsed(HASH, false, true, undefined);
    expect(parsed).toBeTruthy();
    expect(typeof parsed === "string").toBe(true);
    expect(parsed).toBe(PARSED_TEXT);
    const noMd = await cache.getParsed(HASH, true, false, undefined);
    expect(noMd).toBeNull();
    const noConf = await cache.getParsed(HASH, false, true, { dpi: 180 });
    expect(noConf).toBeNull();
  });

  it("Test with markdown, w/config", async () => {
    const cache = new RedisCache();
    const config: Partial<LiteParseConfig> = { targetPages: "1", dpi: 180 };
    await cache.setParsed(HASH, false, true, config, PARSED_TEXT);
    const parsed = await cache.getParsed(HASH, false, true, config);
    expect(parsed).toBeTruthy();
    expect(typeof parsed === "string").toBe(true);
    expect(parsed).toBe(PARSED_TEXT);
    const noMd = await cache.getParsed(HASH, true, false, undefined);
    expect(noMd).toBeNull();
    const diffConf = await cache.getParsed(HASH, false, true, { dpi: 180 });
    expect(diffConf).toBeNull();
    const noConf = await cache.getParsed(HASH, false, true, undefined);
    expect(noConf).toBeNull();
  });
});

describe("Test caching for screenshots", () => {
  it("Test with all pages, no config", async () => {
    const cache = new RedisCache();
    await cache.setScreenshot(HASH, undefined, undefined, SCREENSHOTS);
    const result = await cache.getScreenshot(HASH, undefined, undefined);
    expect(result).toBeTruthy();
    expect(result).toStrictEqual(SCREENSHOTS);
    const noConf = await cache.getScreenshot(HASH, undefined, { dpi: 180 });
    expect(noConf).toBeNull();
    const noPages = await cache.getScreenshot(HASH, "1,2", undefined);
    expect(noPages).toBeNull();
  });

  it("Test with all pages, w/config", async () => {
    const cache = new RedisCache();
    const config: Partial<LiteParseConfig> = { targetPages: "1" };
    await cache.setScreenshot(HASH, undefined, config, SCREENSHOTS);
    const result = await cache.getScreenshot(HASH, undefined, config);
    expect(result).toBeTruthy();
    expect(result).toStrictEqual(SCREENSHOTS);
    const diffConf = await cache.getScreenshot(HASH, undefined, { dpi: 180 });
    expect(diffConf).toBeNull();
    const noConf = await cache.getScreenshot(HASH, undefined, undefined);
    expect(noConf).toBeNull();
    const noPages = await cache.getScreenshot(HASH, "1,2", config);
    expect(noPages).toBeNull();
  });

  it("Test with selected pages, no config", async () => {
    const cache = new RedisCache();
    await cache.setScreenshot(HASH, "1,2", undefined, SCREENSHOTS.slice(0, 2));
    const result = await cache.getScreenshot(HASH, "1,2", undefined);
    expect(result).toBeTruthy();
    expect(result).toStrictEqual(SCREENSHOTS.slice(0, 2));
    const noConf = await cache.getScreenshot(HASH, "1,2", { dpi: 180 });
    expect(noConf).toBeNull();
    const noPages = await cache.getScreenshot(HASH, undefined, undefined);
    expect(noPages).toBeNull();
  });

  it("Test with selected pages, w/config", async () => {
    const cache = new RedisCache();
    const config: Partial<LiteParseConfig> = { targetPages: "1" };
    await cache.setScreenshot(HASH, "1,2", config, SCREENSHOTS.slice(0, 2));
    const result = await cache.getScreenshot(HASH, "1,2", config);
    expect(result).toBeTruthy();
    expect(result).toStrictEqual(SCREENSHOTS.slice(0, 2));
    const diffConf = await cache.getScreenshot(HASH, "1,2", { dpi: 180 });
    expect(diffConf).toBeNull();
    const noConf = await cache.getScreenshot(HASH, "1,2", undefined);
    expect(noConf).toBeNull();
    const noPages = await cache.getScreenshot(HASH, undefined, config);
    expect(noPages).toBeNull();
  });
});

describe("Test caching for isComplex", () => {
  it("Test with no config", async () => {
    const cache = new RedisCache();
    await cache.setIsComplex(HASH, undefined, COMPLEXITY);
    const result = await cache.getIsComplex(HASH, undefined);
    expect(result).toBeTruthy();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toStrictEqual(COMPLEXITY);
    const noConf = await cache.getIsComplex(HASH, { dpi: 180 });
    expect(noConf).toBeNull();
    const noHash = await cache.getIsComplex("other_hash", undefined);
    expect(noHash).toBeNull();
  });

  it("Test with config", async () => {
    const cache = new RedisCache();
    const config: Partial<LiteParseConfig> = { targetPages: "1", dpi: 180 };
    await cache.setIsComplex(HASH, config, COMPLEXITY);
    const result = await cache.getIsComplex(HASH, config);
    expect(result).toBeTruthy();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toStrictEqual(COMPLEXITY);
    const diffConf = await cache.getIsComplex(HASH, { dpi: 180 });
    expect(diffConf).toBeNull();
    const noConf = await cache.getIsComplex(HASH, undefined);
    expect(noConf).toBeNull();
    const noHash = await cache.getIsComplex("other_hash", config);
    expect(noHash).toBeNull();
  });
});
