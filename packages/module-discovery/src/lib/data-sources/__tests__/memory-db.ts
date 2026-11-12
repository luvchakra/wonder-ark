import { createFakeSupabase, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

/**
 * A few tables held in memory behind the fake Supabase client, for tests of code whose
 * point is the order and the conditions of its writes: "fill only if still empty", "a
 * second click finds the first in the ledger", "the lock is taken once". The shared fake
 * records a chain and lets the test answer it; this answers it from rows, so a test can
 * make two calls and ask what the tables hold afterwards.
 *
 * It understands exactly what the code under test uses: select, insert, update, delete,
 * `eq`, `is(column, null)`, `in`, `gt`, `order`, `limit`, `single`, `maybeSingle`, and a
 * unique key per table. Tests only.
 */
type Row = Record<string, unknown>;

export function createMemoryDb(seed: Record<string, Row[]> = {}, unique: Record<string, string> = {}) {
  const tables: Record<string, Row[]> = structuredClone(seed);
  let sequence = 0;

  function answer(call: RecordedQuery) {
    const rows = (tables[call.table] ??= []);
    const op = (method: string) => call.ops.find((entry) => entry.method === method);
    const matches = (row: Row) =>
      call.ops.every(({ method, args }) => {
        const [column, value] = args as [string, unknown];
        if (method === "eq") return row[column] === value;
        if (method === "is") return (row[column] ?? null) === value;
        if (method === "in") return (value as unknown[]).includes(row[column]);
        if (method === "lte") return row[column] != null && String(row[column]) <= String(value);
        if (method === "gte") return row[column] != null && String(row[column]) >= String(value);
        if (method === "gt") return row[column] != null && String(row[column]) > String(value);
        if (method === "neq") return row[column] !== value;
        if (method === "ilike") return String(row[column] ?? "").toLowerCase() === String(value).toLowerCase();
        return true;
      });

    let result: Row[];
    const insert = op("insert");
    const update = op("update");
    const upsert = op("upsert");
    if (upsert) {
      // `onConflict` names the key columns. A row that matches an existing one on all of
      // them is left alone with `ignoreDuplicates` (and does not come back), otherwise
      // it is overwritten in place.
      const options = (upsert.args[1] ?? {}) as { onConflict?: string; ignoreDuplicates?: boolean };
      const keys = (options.onConflict ?? "id").split(",");
      result = [];
      for (const incoming of ([] as Row[]).concat(upsert.args[0] as Row | Row[])) {
        const existing = rows.find((row) => keys.every((key) => row[key] === incoming[key]));
        if (existing) {
          if (options.ignoreDuplicates) continue;
          Object.assign(existing, incoming);
          result.push(existing);
        } else {
          sequence += 1;
          const added: Row = { id: `${call.table}-${sequence}`, created_at: new Date(Date.UTC(2026, 10, 11, 9, 0, sequence)).toISOString(), ...incoming };
          rows.push(added);
          result.push(added);
        }
      }
    } else if (insert) {
      const added = ([] as Row[]).concat(insert.args[0] as Row | Row[]).map((row): Row => {
        sequence += 1;
        return { id: `${call.table}-${sequence}`, created_at: new Date(Date.UTC(2026, 10, 11, 9, 0, sequence)).toISOString(), ...row };
      });
      const key = unique[call.table];
      if (key && added.some((row) => rows.some((existing) => existing[key] === row[key]))) {
        return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      }
      rows.push(...added);
      result = added;
    } else if (update) {
      result = rows.filter(matches);
      for (const row of result) Object.assign(row, update.args[0] as Row);
    } else if (op("delete")) {
      result = rows.filter(matches);
      tables[call.table] = rows.filter((row) => !matches(row));
    } else {
      result = rows.filter(matches);
    }

    const order = op("order");
    if (order) {
      const [column, options] = order.args as [string, { ascending?: boolean } | undefined];
      const direction = options?.ascending === false ? -1 : 1;
      result = [...result].sort((a, b) => (String(a[column]) < String(b[column]) ? -direction : direction));
    }
    const limit = op("limit");
    if (limit) result = result.slice(0, limit.args[0] as number);

    const copy = structuredClone(result);
    if (op("single")) {
      return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
    }
    if (op("maybeSingle")) return { data: copy[0] ?? null, error: null };
    return { data: copy, error: null, count: copy.length };
  }

  const client = createFakeSupabase({ query: (call) => answer(call) as never });
  return {
    client,
    /** The rows of a table as they stand now. */
    rows: (table: string) => tables[table] ?? [],
  };
}
