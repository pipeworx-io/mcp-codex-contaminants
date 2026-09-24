# codex-contaminants

Codex Alimentarius **CXS 193-1995** maximum levels for contaminants and toxins in
food — lead, cadmium, arsenic, mercury, methylmercury, tin, aflatoxins,
ochratoxin A, patulin, melamine, hydrocyanic acid — by commodity.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1679+ live data sources.

**59 maximum levels, 2015 edition.** Both of those numbers are limitations, and
both are stated on every response rather than left in this file.

## Read this before using a value

**Edition.** Codex publishes CXS 193 only as a document, and the current text is
behind an authenticated FAO workspace. This pack carries the newest *public*
official edition, 2015 (`Amended in 2010, 2012, 2013, 2014, 2015`). The standard
has been amended in 2016, 2017, 2018, 2019, 2021, 2022, 2023, and at CAC47 (Nov
2024) and CAC48 (Nov 2025). Those amendments **added** maximum levels — lead in
cinnamon (2.5 mg/kg) and dried culinary herbs (2.0 mg/kg) among them.

**Coverage.** 59 entries from the Schedule I tables. Rows whose commodity name
wraps across table lines were dropped rather than risk labelling a legal limit
with a sentence fragment like "exception of berries".

Together: **a miss is not a finding that no limit exists.** The not-found path
says so in words, because "no maximum level" reads as permission.

Every value carries the source PDF page, so any figure can be checked in one
step against <https://www.fao.org/input/download/standards/17/CXS_193e_2015.pdf>.

## Tools

- `contaminants_max_levels({contaminant, commodity?})` — Codex MLs for a
  contaminant, optionally narrowed to a food.
- `contaminants_for_commodity({commodity})` — every contaminant limit that
  applies to one food.

## Extraction, and what went wrong four times

`extract.py` is the extractor. It is column-band driven for a reason: each of
these was a real, silent failure during the build, and the tests pin all of them.

1. **Character offsets do not work.** The ML column sits at character 36 on one
   page and 29 on the next, so fixed slicing attaches a real limit to a truncated
   commodity name.
2. **Reading any number on the page** swept in, under LEAD, `73` (a JECFA meeting
   number), `25` (the withdrawn PTWI in µg/kg **body weight**) and `3` (3 mmHg of
   blood pressure) as maximum levels. Fixed by taking the ML column's x-band from
   each page's table header and accepting only numbers inside it.
3. **Units differ per contaminant** — aflatoxins are µg/kg, metals mg/kg. The
   unit is read from the header too. Hardcoding mg/kg made aflatoxin M1 in milk
   read 0.5 mg/kg instead of 0.5 µg/kg: wrong by 1000×.
4. **Section headings must come from the document, not memory.** The standard
   says `DEOXYNIVALENOL (DON)`, and a 3-letter heading `TIN` is easy to filter out
   by accident — when it was, tin's canned-meat limits (50 mg/kg) were filed under
   *methylmercury*.

To refresh: point `extract.py` at a newer PDF, re-run, and read the output before
shipping it. The tables are small enough that a human check pass is feasible, and
for legal limits it is not optional.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "codex-contaminants": {
      "url": "https://gateway.pipeworx.io/codex-contaminants/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/codex-contaminants/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1679+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/contaminants_max_levels \
  -H 'Content-Type: application/json' \
  -d '{"contaminant":"lead"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/contaminants_max_levels`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Standalone (no gateway account)

This package also runs as a local stdio MCP server — no Pipeworx account, no
gateway round-trip:

```json
{
  "mcpServers": {
    "codex-contaminants": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-codex-contaminants"]
    }
  }
}
```

Or run it directly to confirm it starts:

```bash
npx -y @pipeworx/mcp-codex-contaminants
```

It speaks MCP over stdin/stdout and answers `initialize`/`tools/list`/`tools/call`
for **only** this pack's tools — none of the shared meta-tools the gateway
connection above adds. Same source, same tools, no ask_pipeworx routing.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Codex Contaminants data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
