import type { SupabaseClient } from "@supabase/supabase-js";

export class IdentityRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async register(username: string): Promise<void> {
    const { error } = await this.supabase
      .from("users")
      .upsert({ username }, { onConflict: "username", ignoreDuplicates: true });
    if (error) throw new Error(`Unable to register authenticated user: ${error.message}`);
  }
}
