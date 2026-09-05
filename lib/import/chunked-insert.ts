import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const CHUNK_SIZE = 500;

/**
 * Batch insert in fixed-size chunks — never one row per round trip
 * (spec R: never insert row-by-row from the browser; this runs entirely
 * server-side, and chunking keeps any single request from growing
 * unbounded as file size scales toward the 10k-100k row target).
 * Returns the inserted rows' ids in the same order as `rows`, or throws
 * on the first failing chunk (the caller decides how to recover).
 */
export async function chunkedInsert<TableName extends keyof Database["public"]["Tables"], Row>(
  supabase: SupabaseClient<Database>,
  table: TableName,
  rows: Row[]
): Promise<{ id: string }[]> {
  const inserted: { id: string }[] = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    if (chunk.length === 0) continue;
    const { data, error } = await supabase
      .from(table)
      // @ts-expect-error -- generic over every table's Insert shape; each call site supplies rows matching its own table.
      .insert(chunk)
      .select("id");
    if (error) throw new Error(`Insert into ${String(table)} failed at row ${i}: ${error.message}`);
    inserted.push(...((data ?? []) as unknown as { id: string }[]));
  }
  return inserted;
}
