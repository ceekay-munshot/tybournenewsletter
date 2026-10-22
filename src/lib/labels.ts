// Left-nav labels. Each dashboard is listed by its own display name — the same
// name its page heading uses, taken from what the source dashboard calls itself
// (e.g. "Taiwan Semiconductor Revenue Tracker", "AI Model Intelligence Dashboard").
//
// Only names that would truncate in the nav, or that are ambiguous next to a
// sibling, get a shorter override here. Everything else falls back to the
// system's `name` from client.config.json.
export const NAV_LABEL: Record<string, string> = {
  // "Taiwan Semiconductor Revenue" is too long for the nav column.
  'taiwan-semi-revenue': 'Taiwan Semi Revenue',
  // Model $/1M-token pricing; "AI Compute Pricing" reads too close to GPU Cloud Pricing.
  'ai-compute-pricing': 'AI Model Pricing',
  // "Texas Instruments Prices" is too long for the nav column.
  'ti-chip-prices': 'TI Chip Prices',
};

/** The nav label for a system: a short override if one exists, else its display name. */
export function navLabel(systemId: string, name: string): string {
  return NAV_LABEL[systemId] ?? name;
}
