/**
 * A minimal in-memory stand-in for the subset of the Supabase JS query
 * builder that lib/cashflow/{syncService,transferMatcher,alerts}.ts
 * actually use. This lets the real sync pipeline run end-to-end in a unit
 * test — same code, same control flow — without a live Postgres/PostgREST
 * stack (unavailable in this sandbox: no network egress to pull the
 * Supabase Docker images, see CASHFLOW_README.md).
 *
 * It is NOT a PostgREST reimplementation — it only supports the exact
 * filter/operation shapes this codebase calls. It also does not enforce
 * DB constraints (unique indexes, RLS) — those are validated separately
 * against a real PostgreSQL 16 instance (see the validation report).
 */

import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  rpcHandlers: Record<string, (args: Record<string, unknown>) => unknown> = {};

  seed(table: string, rows: Row[]) {
    this.tables[table] = rows.map((r) => ({ ...r }));
  }

  from(table: string) {
    this.tables[table] ??= [];
    return new QueryBuilder(this, table);
  }

  async rpc(name: string, args: Record<string, unknown> = {}) {
    const handler = this.rpcHandlers[name];
    if (!handler) throw new Error(`FakeSupabase: no rpc handler registered for "${name}"`);
    const data = handler(args);
    return { data, error: null };
  }
}

class QueryBuilder {
  private filters: Filter[] = [];
  private orderKeys: { col: string; asc: boolean }[] = [];
  private limitN: number | null = null;
  private op: "select" | "insert" | "update" | "upsert" = "select";
  private payload: Row[] = [];
  private upsertOnConflict: string | undefined;
  private wantSingle = false;
  private wantMaybeSingle = false;

  constructor(
    private db: FakeSupabase,
    private table: string
  ) {}

  select(_cols?: string) {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  gt(col: string, val: number) {
    this.filters.push((r) => Number(r[col]) > val);
    return this;
  }
  gte(col: string, val: string | number) {
    this.filters.push((r) => (r[col] as string | number) >= val);
    return this;
  }
  lte(col: string, val: string | number) {
    this.filters.push((r) => (r[col] as string | number) <= val);
    return this;
  }
  is(col: string, val: null) {
    this.filters.push((r) => (r[col] ?? null) === val);
    return this;
  }
  not(col: string, op: string, val: unknown) {
    if (op === "is" && val === null) this.filters.push((r) => (r[col] ?? null) !== null);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderKeys.push({ col, asc: opts?.ascending ?? true });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.wantMaybeSingle = true;
    return this;
  }
  single() {
    this.wantSingle = true;
    return this;
  }

  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }
  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    this.upsertOnConflict = opts?.onConflict;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = [payload];
    return this;
  }

  private runSelect() {
    const table = this.db.tables[this.table]!;
    let rows = table.filter((r) => this.filters.every((f) => f(r)));
    for (const { col, asc } of [...this.orderKeys].reverse()) {
      rows = [...rows].sort((a, b) => {
        const av = a[col] as string | number;
        const bv = b[col] as string | number;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return asc ? cmp : -cmp;
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    return rows;
  }

  private runInsert() {
    const table = this.db.tables[this.table]!;
    const inserted = this.payload.map((p) => ({ id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...p }));
    table.push(...inserted);
    return inserted;
  }

  private runUpsert() {
    const table = this.db.tables[this.table]!;
    const results: Row[] = [];
    for (const p of this.payload) {
      const idx = this.upsertOnConflict ? table.findIndex((r) => r[this.upsertOnConflict!] === p[this.upsertOnConflict!]) : -1;
      if (idx >= 0) {
        table[idx] = { ...table[idx], ...p, updated_at: new Date().toISOString() };
        results.push(table[idx]!);
      } else {
        const row = { id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...p };
        table.push(row);
        results.push(row);
      }
    }
    return results;
  }

  private runUpdate() {
    const table = this.db.tables[this.table]!;
    const matched = table.filter((r) => this.filters.every((f) => f(r)));
    for (const r of matched) Object.assign(r, this.payload[0], { updated_at: new Date().toISOString() });
    return matched;
  }

  then<T>(resolve: (value: T) => void, reject: (err: unknown) => void) {
    try {
      let data: Row[] | Row | null;
      if (this.op === "insert") data = this.runInsert();
      else if (this.op === "upsert") data = this.runUpsert();
      else if (this.op === "update") data = this.runUpdate();
      else data = this.runSelect();

      if (this.wantSingle) {
        const row = Array.isArray(data) ? (data[0] ?? null) : data;
        resolve({ data: row, error: row ? null : { message: "no rows found" } } as T);
        return;
      }
      if (this.wantMaybeSingle) {
        const row = Array.isArray(data) ? (data[0] ?? null) : data;
        resolve({ data: row, error: null } as T);
        return;
      }
      resolve({ data, error: null, count: Array.isArray(data) ? data.length : null } as T);
    } catch (err) {
      reject(err);
    }
  }
}
