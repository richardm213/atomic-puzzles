import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAllPages } from "../../../shared/lib/pagination";

export class MarketAdminRepository {
  constructor(readonly client: SupabaseClient) {}

  rows<T>(
    table: string,
    columns = "*",
    filters: Record<string, string | string[] | number> = {},
    order: string | string[] = "id",
  ): Promise<T[]> {
    return loadAllPages(async (from, size) => {
      let query = this.client.from(table).select(columns);
      for (const [key, value] of Object.entries(filters))
        query = Array.isArray(value) ? query.in(key, value) : query.eq(key, value);
      for (const column of typeof order === "string" ? [order] : order) query = query.order(column);
      const { data, error } = await query.range(from, from + size - 1);
      if (error) throw new Error(`Unable to load ${table}: ${error.message}`);
      return (data ?? []) as T[];
    }, 1000);
  }

  async receipt(operationKey: string) {
    const { data, error } = await this.client
      .from("market_admin_resolution_receipts")
      .select("result")
      .eq("operation_key", operationKey)
      .maybeSingle();
    if (error) throw new Error(`Unable to check settlement receipt: ${error.message}`);
    return data?.result ?? null;
  }

  async apply(plan: unknown) {
    const { data, error } = await this.client.rpc("apply_admin_market_resolution", {
      p_plan: plan,
    });
    if (error) throw new Error(error.message);
    return data;
  }
}
