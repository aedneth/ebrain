/**
 * Snapshot de pricing por token para `routing --json` solamente.
 *
 * Esto no es billing ni una recomendacion: el uso real se registra desde la respuesta del
 * proveedor en el ledger. Un slug ausente conserva USD nulo. El catalogo versionado de perfiles
 * (F6.6.2) reemplazara este snapshot como fuente de metadata fechada.
 */
export interface EstCost { usd: number | null; note: string }

export const PRICING_USD_PER_M: Record<string, { in: number; out: number }> = {
  "deepseek/deepseek-v4-pro": { in: 0.435, out: 0.87 },
  "deepseek/deepseek-v4-flash": { in: 0.077, out: 0.154 },
  "qwen/qwen3-coder:free": { in: 0, out: 0 },
  "moonshotai/kimi-k2.6": { in: 0.66, out: 3.41 },
  "qwen/qwen3-coder-plus": { in: 0.65, out: 3.25 },
  "qwen/qwen3-coder-flash": { in: 0.195, out: 0.975 },
  "z-ai/glm-5.2": { in: 0.35, out: 1.10 },
  "z-ai/glm-4.7": { in: 0.40, out: 1.75 },
  "minimax/minimax-m3": { in: 0.30, out: 1.20 },
  "qwen/qwen3.5-plus-20260420": { in: 0.30, out: 1.80 },
  "qwen/qwen3.5-flash-02-23": { in: 0.065, out: 0.26 },
  "qwen/qwen3.7-max": { in: 1.25, out: 3.75 },
  "qwen/qwen3.7-plus": { in: 0.32, out: 1.28 },
  "qwen/qwen3-next-80b-a3b-instruct:free": { in: 0, out: 0 },
};

const ASSUMED_TOKENS = { in: 3000, out: 1500 };

export function estimateRouteCost(model: string): EstCost {
  const pricing = PRICING_USD_PER_M[model];
  if (!pricing) {
    return { usd: null, note: `pricing no verificado para ${model}; el costo real solo queda disponible despues de uso reportado` };
  }
  const usd = (ASSUMED_TOKENS.in * pricing.in + ASSUMED_TOKENS.out * pricing.out) / 1e6;
  return {
    usd: +usd.toFixed(6),
    note: `estimacion de ${ASSUMED_TOKENS.in} tokens de entrada y ${ASSUMED_TOKENS.out} de salida; no es billing real`,
  };
}
