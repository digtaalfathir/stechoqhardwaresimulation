import { getJson } from '../core/wire';

/**
 * Master data the warehouse API serves, so the handheld's dropdowns hold the
 * values that host actually knows rather than a list copied into the source.
 *
 * Both hosts answer these without an Authorization header and send
 * `Access-Control-Allow-Origin: *`, so the browser may read them directly.
 */

export const RR_TYPE_PATH = '/api/v1/master/dropdown/rr-type/components?factory_id=&category_id=';
/** One page of 500 covers every host measured so far (222 is the largest). */
export const FACTORY_PATH = '/api/v1/master/warehouse-factory/?page=1&limit=500';

export interface Factory {
  /** Sent as `factory_id` in a replacement. */
  id: number;
  /** Sent as `factory_code` in a scan payload. */
  code: string;
  name: string;
}

export interface MasterData {
  rrTypes: string[];
  factories: Factory[];
}

export interface MasterFetch {
  ok: boolean;
  data: MasterData;
  /** One line per request, for the communication log. */
  reports: {
    name: string;
    url: string;
    ok: boolean;
    count: number;
    status: number;
    durationMs: number;
    error?: string;
  }[];
  error?: string;
}

interface RrTypeRow {
  rr_type?: unknown;
}
interface FactoryRow {
  id?: unknown;
  code?: unknown;
  name?: unknown;
}
interface Envelope<T> {
  data?: T[];
  meta?: { total_items?: number; total_page?: number };
}

export function masterUrls(baseUrl: string) {
  const base = baseUrl.replace(/\/+$/, '');
  return { rrTypes: `${base}${RR_TYPE_PATH}`, factories: `${base}${FACTORY_PATH}` };
}

/** The API lists a type once per component, so the same code repeats. */
function uniqueRrTypes(rows: RrTypeRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const type = typeof row.rr_type === 'string' ? row.rr_type.trim() : '';
    if (!type || seen.has(type)) continue;
    seen.add(type);
    out.push(type);
  }
  return out;
}

/** A factory without an id cannot be used for a replacement, so it is dropped. */
function usableFactories(rows: FactoryRow[]): Factory[] {
  const out: Factory[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = Number(row.id);
    const code = typeof row.code === 'string' ? row.code.trim() : '';
    if (!Number.isFinite(id) || !code || seen.has(code)) continue;
    seen.add(code);
    out.push({ id, code, name: typeof row.name === 'string' ? row.name.trim() : '' });
  }
  return out;
}

/**
 * Reads both lists from one host. A partial result is still returned: one list
 * failing should not blank the other.
 */
export async function fetchMasterData(baseUrl: string): Promise<MasterFetch> {
  const urls = masterUrls(baseUrl);
  const [rr, fa] = await Promise.all([
    getJson<Envelope<RrTypeRow>>(urls.rrTypes),
    getJson<Envelope<FactoryRow>>(urls.factories),
  ]);

  const rrTypes = rr.ok ? uniqueRrTypes(rr.data?.data ?? []) : [];
  const factories = fa.ok ? usableFactories(fa.data?.data ?? []) : [];

  const reports = [
    {
      name: 'RR types',
      url: urls.rrTypes,
      ok: rr.ok,
      count: rrTypes.length,
      status: rr.status,
      durationMs: rr.durationMs,
      error: rr.error,
    },
    {
      name: 'factories',
      url: urls.factories,
      ok: fa.ok,
      count: factories.length,
      status: fa.status,
      durationMs: fa.durationMs,
      error: fa.error,
    },
  ];

  const failures = reports.filter((r) => !r.ok);
  return {
    ok: failures.length === 0,
    data: { rrTypes, factories },
    reports,
    error: failures.map((f) => f.error).filter(Boolean).join(' · ') || undefined,
  };
}

/** `5022 · DENSO INDONESIA` — the code stays the value, the name is context. */
export function factoryLabels(factories: Factory[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const f of factories) labels[f.code] = f.name ? `${f.code} · ${f.name}` : f.code;
  return labels;
}
