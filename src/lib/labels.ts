// Left-nav labels. These are PLACEHOLDERS: each dashboard is labelled by its
// SOURCE REPO name for now, so every tab is easy to trace back to the dashboard
// it came from. The client will hand over final display names later — when they
// do, only this one map changes (the rest of the app reads it through repoLabel).
//
// Two systems (model pricing + GPU) share one repo (AI-Compute-Pricing), so they
// carry a short qualifier to stay distinct in the menu.
export const REPO_LABEL: Record<string, string> = {
  'cpu-prices': 'cpuprices',
  'taiwan-semi-revenue': 'taiwan-semicon-revenue-tracker',
  'ai-compute-pricing': 'AI-Compute-Pricing · Model Pricing',
  'gpu-cloud-pricing': 'AI-Compute-Pricing · GPU',
  'schneider-electric': 'schneider-electric',
  'thirteen-f': '13F',
  nubank: 'nubankdash',
  'sap-ai': 'sap',
  airlines: 'Airlines',
  huggingface: 'huggingface',
  'ai-model-intel': 'google-dash',
  'ti-chip-prices': 'texas-instruments-dashboard',
  'podcast-themes': 'podcast',
};

/** The placeholder repo label for a system, falling back to its human name. */
export function repoLabel(systemId: string, fallback: string): string {
  return REPO_LABEL[systemId] ?? fallback;
}
