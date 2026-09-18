/**
 * Published per-million-token prices, in one place so the server and the console agree.
 *
 * Client-safe on purpose: the Buddy console turns `ai_cost_summary()`'s token counts into money in
 * the browser, and `models.ts` re-exports this for server callers. The database deliberately stores
 * no prices — a price change is one edit here rather than a number quietly going out of date in a
 * migration.
 *
 * These are estimates for proportion and trend ("Buddy cost about this much, mostly on that
 * feature"), not an invoice. A model this table does not know contributes tokens but no cost, and
 * the console says so rather than inventing a number.
 */
export const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export type TokenCounts = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_tokens?: number | null;
  cache_write_tokens?: number | null;
};

/** Null when the model is not in the table — an unknown price is not zero. */
export function estimateCostUsd(model: string, u: TokenCounts): number | null {
  const p = PRICE_PER_MTOK[model];
  if (!p) return null;
  const m = 1_000_000;
  // Cache reads bill at roughly a tenth of input; cache writes at roughly 1.25×.
  return (
    ((u.input_tokens || 0) * p.input +
      (u.output_tokens || 0) * p.output +
      (u.cache_read_tokens || 0) * p.input * 0.1 +
      (u.cache_write_tokens || 0) * p.input * 1.25) /
    m
  );
}

export function usd(n: number | null) {
  if (n === null) return "—";
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(n < 10 ? 2 : 0)}`;
}
