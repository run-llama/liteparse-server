# API Specification

Base URL: `http://localhost:5707`

### `POST /parse` — parse a single file

Parses a single document and returns either structured page data or plain text.

**Form fields:**

| Field    | Type   | Required | Description                               |
| -------- | ------ | -------- | ----------------------------------------- |
| `file`   | file   | ✅       | The document to parse                     |
| `config` | string | ❌       | JSON-serialized `LiteParseConfig` options |

**Query parameters:**

| Parameter  | Type    | Default | Description                                                                                             |
| ---------- | ------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `text`     | boolean | `false` | If `true`, returns `text/plain`; otherwise `application/json` with a `pages` array                      |
| `markdown` | boolean | `false` | If `true`, returns `text/plain` (markdown formatted); otherwise `application/json` with a `pages` array |

**Responses:**

- `200 text/plain` — extracted text (when `text=true` or `markdown=true`)
- `200 application/json` — `{ "pages": [...] }` (when `text=false` and `markdown=true`)
- `400` — missing `file`
- `429` — rate limit exceeded

---

### `POST /screenshots` — screenshot pages of a document

Renders document pages as PNG images and streams them back as newline-delimited JSON (NDJSON).

**Form fields:**

| Field    | Type   | Required | Description                               |
| -------- | ------ | -------- | ----------------------------------------- |
| `file`   | file   | ✅       | The document to screenshot                |
| `config` | string | ❌       | JSON-serialized `LiteParseConfig` options |

**Query parameters:**

| Parameter | Type   | Default | Description                                                       |
| --------- | ------ | ------- | ----------------------------------------------------------------- |
| `pages`   | string | all     | Comma-separated 1-based page numbers to screenshot (e.g. `1,2,3`) |

Page numbers must be positive decimal integers that can be represented safely.
An omitted or empty `pages` parameter selects all pages. Invalid selectors (for
example `1abc`, `1.5`, `0` or `1,,2`) return `400` with a `detail` message.

**Response `200 application/x-ndjson`** — one JSON object per line:

```json
{
  "index": 0,
  "mimetype": "image/png",
  "data": "<base64>",
  "page_number": 1,
  "height": 1056,
  "width": 816
}
```

---

### `POST /is-complex` — estimate the complexity of a document and the need for OCR

Estimates the complexity of a file based on text disposition, presence of images and other factors, determining the need for more advanced OCR and parsing tools, such as [LlamaParse](https://cloud.llamaindex.ai)

**Form fields:**

| Field    | Type   | Required | Description                               |
| -------- | ------ | -------- | ----------------------------------------- |
| `file`   | file   | ✅       | The document to screenshot                |
| `config` | string | ❌       | JSON-serialized `LiteParseConfig` options |

**Response `200 application/json`** — one JSON object containing an array of per-page complexity stats:

```json
{
  "pages": [
    {
      "pageNumber": 1,
      "textLength": 918,
      "textCoverage": 0.0963800922036171,
      "hasSubstantialImages": false,
      "imageBlockCount": 0,
      "imageCoverage": 0,
      "largestImageCoverage": 0,
      "fullPageImage": false,
      "isGarbled": false,
      "pageArea": 484704,
      "needsOcr": true,
      "reasons": ["sparse-text"]
    },
    {
      "pageNumber": 2,
      "textLength": 889,
      "textCoverage": 0.08518374711275101,
      "hasSubstantialImages": false,
      "imageBlockCount": 0,
      "imageCoverage": 0,
      "largestImageCoverage": 0,
      "fullPageImage": false,
      "isGarbled": false,
      "pageArea": 484704,
      "needsOcr": true,
      "reasons": ["sparse-text"]
    }
  ]
}
```
