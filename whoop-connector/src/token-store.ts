/** KV-backed storage for the single connected WHOOP account's OAuth tokens. */

export interface WhoopTokens {
  access_token: string;
  refresh_token: string;
  /** Epoch milliseconds. */
  expires_at: number;
}

const KEY = "whoop_tokens";

export async function saveTokens(kv: KVNamespace, tokens: WhoopTokens): Promise<void> {
  await kv.put(KEY, JSON.stringify(tokens));
}

export async function loadTokens(kv: KVNamespace): Promise<WhoopTokens | null> {
  const raw = await kv.get(KEY);
  return raw ? (JSON.parse(raw) as WhoopTokens) : null;
}
