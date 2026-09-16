interface McpToolDefinition {
  name: string;
  description: string;
  /** Human-facing one-liner (fleet #1967). Optional; consumers fall back to
   *  description. Kept in step with shared/src/types.ts — scripts/lib/
   *  check-inlined-types.mjs reports drift at publish time. */
  summary?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    anyOf?: Array<{ required: string[] }>;
    oneOf?: Array<{ required: string[] }>;
    allOf?: Array<{ required: string[] }>;
  };
  outputSchema?: Record<string, unknown>;
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Codex Alimentarius CXS 193 — maximum levels for contaminants and toxins in
 * food and feed: lead, cadmium, arsenic, methylmercury, tin, aflatoxins,
 * ochratoxin A, patulin and others, by commodity.
 *
 * These are the internationally agreed ceilings used as the reference in food
 * trade disputes, so two limitations are stated on EVERY response rather than
 * buried in documentation:
 *
 *  1. EDITION. Codex publishes CXS 193 only as a document, and the current text
 *     sits behind an authenticated FAO workspace. This pack carries the newest
 *     PUBLIC official edition, 2015. The standard has been amended nine-plus
 *     times since, and those amendments ADDED maximum levels — lead in cinnamon
 *     and in dried culinary herbs among them.
 *  2. COVERAGE. 59 entries, extracted from the Schedule I tables. Rows whose
 *     commodity name wraps across table lines were dropped rather than risk
 *     labelling a legal limit with a sentence fragment.
 *
 * Together those mean a miss here is NOT a finding that no limit exists, and
 * the not-found path says so in words. That is the failure this pack must not
 * have: "no maximum level" reads as permission.
 *
 * Every value carries the PDF page it came from, so any figure can be checked
 * against the source in one step.
 */

import cxs from './data/cxs193.json';

interface Level {
  contaminant: string;
  commodity: string;
  ml: number;
  unit: string;
  page: number;
}

interface Standard {
  standard: string;
  title: string;
  edition: string;
  edition_line: string;
  source_pdf: string;
  current_edition_note: string;
  extracted_entries: number;
  coverage_note: string;
  levels: Level[];
}

const DATA = cxs as unknown as Standard;

/** Stamped on every response, hit or miss. A limit without its edition is unusable. */
const PROVENANCE = {
  standard: DATA.standard,
  edition: DATA.edition,
  edition_line: DATA.edition_line,
  source: DATA.source_pdf,
  currency_warning: DATA.current_edition_note,
  coverage: DATA.coverage_note,
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Does this commodity cell answer the query?
 *
 * Substring matching in BOTH directions was too loose: acrylonitrile's commodity
 * is the single word "Food", so any query mentioning food matched it — including
 * "zzz nonexistent food", which then reported a limit for a food that does not
 * exist. Every query token must appear in the commodity instead, which still
 * lets "polished rice" find "Rice, polished" without letting one stray word in.
 */
function commodityMatches(cell: string, query: string): boolean {
  const c = norm(cell);
  const tokens = norm(query).split(' ').filter(Boolean);
  if (!tokens.length) return false;
  return tokens.every((t) => c.split(' ').some((w) => w === t || w.startsWith(t)));
}

function formatLevel(l: Level) {
  return {
    contaminant: l.contaminant,
    commodity: l.commodity,
    maximum_level: l.ml,
    unit: l.unit,
    // Units differ per contaminant — aflatoxins are µg/kg, metals mg/kg — so the
    // unit is never implied. Reading one for the other is a 1000x error.
    stated_as: `${l.ml} ${l.unit}`,
    source_page: l.page,
  };
}

const NOT_A_CLEARANCE =
  'This is a partial extraction of the 2015 edition. A commodity absent here may still have a maximum level — either in a table row this extraction skipped, or in one of the amendments adopted since 2015. Absence is not a finding that no limit applies.';

const tools: McpToolExport['tools'] = [
  {
    name: 'contaminants_max_levels',
    description:
      'Codex Alimentarius maximum levels (MLs) for a contaminant in food — lead, cadmium, arsenic, mercury, methylmercury, tin, aflatoxins, ochratoxin A, patulin, melamine, hydrocyanic acid. Returns each commodity with its maximum level, the unit it is expressed in, and the page of CXS 193 it came from. Use for "what is the Codex limit for lead in fish" or "which foods have cadmium maximum levels".',
    inputSchema: {
      type: 'object',
      properties: {
        contaminant: {
          type: 'string',
          description: 'Contaminant name, e.g. "lead", "cadmium", "aflatoxins", "methylmercury", "tin". Matched case-insensitively.',
        },
        commodity: {
          type: 'string',
          description: 'Optional. Narrow to a commodity or food group, e.g. "rice", "fish", "milk", "vegetables".',
        },
      },
      required: ['contaminant'],
    },
  },
  {
    name: 'contaminants_for_commodity',
    description:
      'Every Codex maximum level that applies to one food — "which contaminant limits apply to rice", "what are the Codex limits for milk". Returns each contaminant with its maximum level and unit for that commodity, from CXS 193.',
    inputSchema: {
      type: 'object',
      properties: {
        commodity: {
          type: 'string',
          description: 'Food or commodity name, e.g. "rice", "fish", "milk", "cereal grains", "natural mineral waters".',
        },
      },
      required: ['commodity'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'contaminants_max_levels': {
      const contaminant = String(args.contaminant ?? '').trim();
      if (!contaminant) throw new Error('Required argument "contaminant" is missing. Pass e.g. "lead".');
      const want = norm(contaminant);
      let hits = DATA.levels.filter((l) => norm(l.contaminant).includes(want) || want.includes(norm(l.contaminant).split(' ')[0]));
      const commodity = typeof args.commodity === 'string' ? norm(args.commodity) : '';
      if (commodity) hits = hits.filter((l) => commodityMatches(l.commodity, commodity));

      if (!hits.length) {
        return {
          found: false,
          reason: 'no_entry_in_this_extraction',
          requested_contaminant: contaminant,
          ...(args.commodity ? { requested_commodity: args.commodity } : {}),
          message: NOT_A_CLEARANCE,
          contaminants_available: [...new Set(DATA.levels.map((l) => l.contaminant))],
          ...PROVENANCE,
        };
      }
      return {
        found: true,
        contaminant: hits[0].contaminant,
        ...(args.commodity ? { commodity_filter: args.commodity } : {}),
        count: hits.length,
        maximum_levels: hits.map(formatLevel),
        ...PROVENANCE,
      };
    }

    case 'contaminants_for_commodity': {
      const commodity = String(args.commodity ?? '').trim();
      if (!commodity) throw new Error('Required argument "commodity" is missing. Pass e.g. "rice".');
      const hits = DATA.levels.filter((l) => commodityMatches(l.commodity, commodity));
      if (!hits.length) {
        return {
          found: false,
          reason: 'no_entry_in_this_extraction',
          requested_commodity: commodity,
          message: NOT_A_CLEARANCE,
          ...PROVENANCE,
        };
      }
      return {
        found: true,
        commodity,
        count: hits.length,
        applicable_limits: hits.map(formatLevel),
        ...PROVENANCE,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;

export { DATA, formatLevel };
