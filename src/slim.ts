import express from "express";
import multer from "multer";
import {
  isComplex,
  parse,
  parseScreenshotPages,
  screenshot,
  SCREENSHOT_MIMETYPE,
} from "./utils";
import type { LiteParseConfig, ParsedPage } from "@llamaindex/liteparse";
import { PrefixedLogger } from "./logger";

export const app = express();
const upload = multer({ storage: multer.memoryStorage() });

/*
This endpoint looks for the following fields in form data:
- 'file': containing file data
- 'config': serialized config for LiteParse
Moreover, it takes an optional `text` query parameter that
defines whether the response will be `text/plain` (containing only
parsed text) or `application/json` (the full parsed pages object).
A `markdown` query parameter can be passed, with the same effect as
text, but the returned text will be markdown formatted.
*/
app.post("/parse", upload.single("file"), async (req, res) => {
  const logger = new PrefixedLogger("[POST /parse]");
  logger.info("Received request");
  const fl = req.file;
  if (!fl) {
    logger.error("No `file` provided");
    res
      .status(400)
      .send({ detail: "You need to provide a file in the `file` field" });
    return;
  }
  const { text, markdown } = req.query;
  const config = req.body.config as string | undefined;
  let loadedConfig: Partial<LiteParseConfig> | undefined = undefined;
  if (config) {
    loadedConfig = JSON.parse(config);
  }
  const useText =
    text && !Array.isArray(text)
      ? text.toString().toLowerCase() === "true"
      : false;
  const useMd =
    markdown && !Array.isArray(markdown)
      ? markdown.toString().toLowerCase() === "true"
      : false;
  if (useMd) {
    if (loadedConfig) {
      loadedConfig.outputFormat = "markdown";
    } else {
      loadedConfig = { outputFormat: "markdown" };
    }
  }
  logger.debug(
    `text = ${useText ? "true" : "false"}; markdown = ${useMd ? "true" : "false"}; config = ${loadedConfig ? "set" : "unset"}`,
  );

  if (useText || useMd) {
    const result = (await parse({
      file: fl,
      text: useText || useMd,
      config: loadedConfig,
    })) as string;
    res.header("Content-Type", "text/plain").status(200).send(result);
    logger.info("Completed request successfully");
    return;
  } else {
    const result = (await parse({
      file: fl,
      config: loadedConfig,
    })) as ParsedPage[];
    res
      .header("Content-Type", "application/json")
      .status(200)
      .send({ pages: result });
    logger.info("Completed request successfully");
    return;
  }
});

/*
This endpoint looks for the following fields in form data:
- 'file': containing file data
- 'config': serialized config for LiteParse
Moreover, it takes an optional `pages` query parameter that
defines the pages to screenshot, and has to be a string containing
comma-separated numeric values (e.g.: '1,2,3,7,9')
*/
app.post("/screenshots", upload.single("file"), async (req, res) => {
  const logger = new PrefixedLogger("[POST /screenshots]");
  logger.info("Received request");
  const fl = req.file;
  if (!fl) {
    logger.error("No `file` provided");
    res
      .status(400)
      .send({ detail: "You need to provide a file in the `file` field" });
    return;
  }
  const { pages } = req.query;
  let loadedPages: string = "";
  if (!pages) {
    loadedPages = "";
  } else if (Array.isArray(pages)) {
    logger.warn("Multiple `pages` parameter values were set, joining them...");
    loadedPages = pages.map((p) => p.toString()).join(",");
  } else if (!Array.isArray(pages)) {
    loadedPages = pages.toString();
  }
  let toScreenshot: number[] | undefined;
  try {
    toScreenshot = parseScreenshotPages(loadedPages);
  } catch (e) {
    logger.error(`An error occurred while parsing page parameter: ${e}`);
    res.status(400).send({
      detail: "`pages` should be a comma-separated string of numeric values",
    });
    return;
  }
  const config = req.body.config as string | undefined;
  let loadedConfig: Partial<LiteParseConfig> | undefined = undefined;
  if (config) {
    loadedConfig = JSON.parse(config);
  }

  const result = await screenshot({
    file: fl,
    config: loadedConfig,
    pageNumbers: toScreenshot,
  });
  res.setHeader("Content-Type", "application/x-ndjson");
  for (let i = 0; i < result.length; i++) {
    const { imageBuffer, pageNum, height, width } = result[i]!;
    const payload = {
      index: i,
      mimetype: SCREENSHOT_MIMETYPE,
      data: imageBuffer.toString("base64"),
      page_number: pageNum,
      height,
      width,
    };
    res.write(JSON.stringify(payload) + "\n");
  }

  res.end();
  logger.info(`Successfully sent ${result.length} screenshots as a response`);
});

/*
This endpoint looks for the following fields in form data:
- 'file': containing file data
- 'config': serialized config for LiteParse
*/
app.post("/is-complex", upload.single("file"), async (req, res) => {
  const logger = new PrefixedLogger("[POST /is-complex]");
  logger.info("Received request");
  const fl = req.file;
  if (!fl) {
    logger.error("No `file` provided");
    res
      .status(400)
      .send({ detail: "You need to provide a file in the `file` field" });
    return;
  }
  const config = req.body.config as string | undefined;
  let loadedConfig: Partial<LiteParseConfig> | undefined = undefined;
  if (config) {
    loadedConfig = JSON.parse(config);
  }

  const result = await isComplex({
    file: fl,
    config: loadedConfig,
  });
  res
    .header("Content-Type", "application/json")
    .status(200)
    .send({ pages: result });
  logger.info("Completed request successfully");
  return;
});
