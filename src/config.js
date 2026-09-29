/** All application settings live here. No external credentials or services. */
export const DEFAULTS = Object.freeze({
  capital: 25_000,
  positionSize: 10_000,
  feeBps: 4,
  slippageBps: 2,
  strategy: 'trend',
  market: 'BTC',
  days: 30,
  seed: 42,
});

export const MARKETS = Object.freeze({
  BTC: { name: 'Bitcoin', base: 68_400, volatility: 0.0055, seed: 11, symbol: 'B', color: '#f7931a' },
  ETH: { name: 'Ethereum', base: 3_420, volatility: 0.007, seed: 29, symbol: 'Ξ', color: '#a4a9f8' },
  SOL: { name: 'Solana', base: 148, volatility: 0.009, seed: 47, symbol: '◎', color: '#9fe9ce' },
  HYPE: { name: 'Hyperliquid', base: 27.4, volatility: 0.011, seed: 71, symbol: 'H', color: '#7fe0d4' },
});

export const STRATEGIES = Object.freeze({
  trend: { name: 'Trend follow', tag: 'MOMENTUM', description: 'Follow the direction of the 12 / 36-hour moving averages. Stay long above, short below.', fast: 12, slow: 36 },
  reversion: { name: 'Mean reversion', tag: 'CONTRARIAN', description: 'Fade a 1.5σ move from the 24-hour mean. Return to cash when price reaches the mean.', period: 24, threshold: 1.5 },
  breakout: { name: 'Range breakout', tag: 'VOLATILITY', description: 'Trade a close outside the previous 24-hour range. Hold until the opposite breakout.', period: 24 },
});
