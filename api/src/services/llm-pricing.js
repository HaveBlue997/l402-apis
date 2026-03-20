const MODEL_SIZES = {
  "qwen3:32b": 32,
  "llama3.1:70b": 70,
  "deepseek-r1:70b": 70,
  "devstral:24b": 24,
  "qwen2.5-coder:32b": 32,
  "command-r:35b": 35,
};

const TIERS = [
  { name: "small", maxParams: 14, rate: 50 },
  { name: "medium", maxParams: 35, rate: 100 },
  { name: "large", maxParams: 80, rate: 200 },
];

const SATS_PER_USD_APPROX = 1_100;

function getModelSizeB(model) {
  if (MODEL_SIZES[model]) return MODEL_SIZES[model];

  const match = model.match(/(\d+)[bB]/);
  if (match) return parseInt(match[1], 10);

  return null;
}

function getTier(sizeB) {
  if (!sizeB) return TIERS[1]; // default to medium if unknown
  for (const tier of TIERS) {
    if (sizeB <= tier.maxParams) return tier;
  }
  return TIERS[TIERS.length - 1];
}

export function calculatePrice(model, tokenCount) {
  const sizeB = getModelSizeB(model);
  const tier = getTier(sizeB);
  const priceSats = Math.ceil((tokenCount / 1000) * tier.rate);

  return {
    price_sats: priceSats,
    rate_per_1k: tier.rate,
    tier: tier.name,
    model_size_b: sizeB,
    usd_approx: +(priceSats / SATS_PER_USD_APPROX).toFixed(5),
  };
}
