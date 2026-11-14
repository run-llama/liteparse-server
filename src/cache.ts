import {
  LiteParseConfig,
  PageComplexityStats,
  ParsedPage,
  ScreenshotResult,
} from "@llamaindex/liteparse";
import { Mutex } from "async-mutex";
import Redis from "ioredis";
import crypto from "crypto";

export class RedisCache {
  private uri: string;
  private password: string;
  private mu: Mutex;
  private client: Redis | undefined = undefined;
  readonly parsePrefix: string = "parse";
  readonly screenshotPrefix: string = "screenshot";
  readonly isComplexPrefix: string = "isComplex";

  constructor() {
    const key = process.env.REDIS_URI;
    const psw = process.env.REDIS_PASSWORD;
    if (key && psw) {
      this.uri = key;
      this.password = psw;
      this.mu = new Mutex();
    } else {
      throw new Error(
        "Cannot initialize Redis client as REDIS_URI or REDIS_PASSWORD are not available in the current environment",
      );
    }
  }

  private async getClient() {
    const client = await this.mu.runExclusive(async () => {
      if (this.client) {
        return this.client;
      }
      this.client = new Redis(this.uri, {
        enableOfflineQueue: true,
        password: this.password,
      });
      this.client.on("error", (err) => {
        console.error("Redis error:", err);
      });
      return this.client;
    });
    return client;
  }

  async setParsed(
    fileHash: string,
    text: boolean,
    markdown: boolean,
    config: Partial<LiteParseConfig> | undefined,
    result: string | ParsedPage[],
  ) {
    const client = await this.getClient();
    const conf = config ? JSON.stringify(config) : "unset";
    await client.setex(
      `${this.parsePrefix}:${markdown ? "markdown" : text ? "text" : "pages"}:${conf}:${fileHash}`,
      3600, // 1 hour
      typeof result === "string" ? result : JSON.stringify(result),
    );
  }

  async getParsed(
    fileHash: string,
    text: boolean,
    markdown: boolean,
    config: Partial<LiteParseConfig> | undefined,
  ) {
    const client = await this.getClient();
    const conf = config ? JSON.stringify(config) : "unset";
    const stored = await client.get(
      `${this.parsePrefix}:${markdown ? "markdown" : text ? "text" : "pages"}:${conf}:${fileHash}`,
    );
    if (stored) {
      if (text || markdown) {
        return stored;
      } else {
        return JSON.parse(stored) as ParsedPage[];
      }
    }
    return null;
  }

  async setScreenshot(
    fileHash: string,
    pages: string | undefined,
    config: Partial<LiteParseConfig> | undefined,
    result: ScreenshotResult[],
  ) {
    const client = await this.getClient();
    const conf = config ? JSON.stringify(config) : "unset";
    await client.setex(
      `${this.screenshotPrefix}:${pages ? pages : "all"}:${conf}:${fileHash}`,
      24 * 3600, // 24 hours
      JSON.stringify(result),
    );
  }

  async getScreenshot(
    fileHash: string,
    pages: string | undefined,
    config: Partial<LiteParseConfig> | undefined,
  ) {
    const client = await this.getClient();
    const conf = config ? JSON.stringify(config) : "unset";
    const stored = await client.get(
      `${this.screenshotPrefix}:${pages ? pages : "all"}:${conf}:${fileHash}`,
    );
    if (stored) {
      const result = JSON.parse(stored) as ScreenshotResult[];
      // Buffer.toJSON() stores { type: "Buffer", data: [...] }; restore the
      // Buffer before callers encode screenshots just like fresh results.
      for (const shot of result) {
        shot.imageBuffer = Buffer.from(shot.imageBuffer);
      }
      return result;
    }
    return null;
  }

  async setIsComplex(
    fileHash: string,
    config: Partial<LiteParseConfig> | undefined,
    result: PageComplexityStats[],
  ) {
    const client = await this.getClient();
    const conf = config ? JSON.stringify(config) : "unset";
    await client.setex(
      `${this.isComplexPrefix}:${conf}:${fileHash}`,
      24 * 3600, // 24 hours
      JSON.stringify(result),
    );
  }

  async getIsComplex(
    fileHash: string,
    config: Partial<LiteParseConfig> | undefined,
  ) {
    const client = await this.getClient();
    const conf = config ? JSON.stringify(config) : "unset";
    const stored = await client.get(
      `${this.isComplexPrefix}:${conf}:${fileHash}`,
    );
    if (stored) {
      return JSON.parse(stored) as PageComplexityStats[];
    }
    return null;
  }
}

export function getFileHash(file: Express.Multer.File) {
  return crypto
    .createHash("sha256")
    .update(new Uint8Array(file.buffer))
    .digest("hex");
}

let cache: RedisCache | undefined = undefined;

export function getCache() {
  if (!cache) {
    cache = new RedisCache();
  }
  return cache;
}
