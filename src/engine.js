import { DEFAULTS, MARKETS, STRATEGIES } from './config.js';

/** Small seeded PRNG. The same seed always produces the same scenario. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateMarket(symbol = 'BTC', seed = 42, count = 720) {
  if (!Object.hasOwn(MARKETS, symbol)) throw new RangeError('Unknown market');
  const market = MARKETS[symbol];
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new RangeError('Invalid seed');
  if (!Number.isInteger(count) || count < 2 || count > 20_000) throw new RangeError('Invalid bar count');
  const random = seededRandom(seed + market.seed);
  const start = Date.UTC(2026, 3, 1);
  let price = market.base;
  let drift = 0;
  return Array.from({ length: count }, (_, i) => {
    if (i % 72 === 0) drift = (random() - 0.44) * market.volatility * 0.7;
    const open = price;
    // Bounded noise and changing drift create illustrative market regimes.
    const noise = (random() + random() + random() - 1.5) * market.volatility;
    price = open * Math.exp(drift + noise);
    const wick = random() * market.volatility * 0.6;
    return {
      time: start + i * 3_600_000,
      open, close: price,
      high: Math.max(open, price) * (1 + wick),
      low: Math.min(open, price) * (1 - wick),
      volume: Math.round(250 + random() * 2500),
    };
  });
}

function validateBars(bars) {
  if (!Array.isArray(bars) || bars.length < 2) throw new RangeError('At least two bars are required');
  bars.forEach((bar, i) => {
    if (!Number.isFinite(bar.time) || (i && bar.time <= bars[i - 1].time)) throw new RangeError('Bars must have increasing timestamps');
    if (![bar.open, bar.high, bar.low, bar.close].every(x => Number.isFinite(x) && x > 0)) throw new RangeError('Prices must be finite and positive');
    if (bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close) || bar.low > bar.high) throw new RangeError('Invalid OHLC range');
  });
}

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;

/** A target is known only AFTER its bar closes. Execution is on the NEXT open. */
export function createTargets(bars, strategy = 'trend') {
  if (!Object.hasOwn(STRATEGIES, strategy)) throw new RangeError('Unknown strategy');
  const closes = bars.map(bar => bar.close);
  let target = 0;
  return bars.map((bar, i) => {
    const spec = STRATEGIES[strategy];
    if (strategy === 'trend') {
      if (i + 1 < spec.slow) return 0;
      const fast = mean(closes.slice(i + 1 - spec.fast, i + 1));
      const slow = mean(closes.slice(i + 1 - spec.slow, i + 1));
      target = fast > slow ? 1 : fast < slow ? -1 : 0;
    } else if (strategy === 'reversion') {
      if (i + 1 < spec.period) return 0;
      const window = closes.slice(i + 1 - spec.period, i + 1);
      const average = mean(window);
      const std = Math.sqrt(mean(window.map(value => (value - average) ** 2)));
      if ((target === 1 && bar.close >= average) || (target === -1 && bar.close <= average)) target = 0;
      if (std > 0 && bar.close < average - spec.threshold * std) target = 1;
      else if (std > 0 && bar.close > average + spec.threshold * std) target = -1;
    } else {
      if (i < spec.period) return 0;
      const window = bars.slice(i - spec.period, i);
      if (bar.close > Math.max(...window.map(value => value.high))) target = 1;
      else if (bar.close < Math.min(...window.map(value => value.low))) target = -1;
    }
    return target;
  });
}

/**
 * One position at a time, capped at available equity and requested notional.
 * Equity = realized balance + open P&L. Fees are charged on executed notional.
 * No leverage, compounding target size, funding, stops, or liquidation model.
 */
export function backtest(bars, options = {}) {
  validateBars(bars);
  const settings = { ...DEFAULTS, ...options };
  for (const key of ['capital', 'positionSize']) {
    if (!Number.isFinite(settings[key]) || settings[key] <= 0) throw new RangeError(`${key} must be positive`);
  }
  for (const key of ['feeBps', 'slippageBps']) {
    if (!Number.isFinite(settings[key]) || settings[key] < 0 || settings[key] > 1000) throw new RangeError(`${key} must be between 0 and 1000`);
  }
  const signals = settings.targets ?? createTargets(bars, settings.strategy);
  if (!Array.isArray(signals) || signals.length !== bars.length || signals.some(value => ![-1, 0, 1].includes(value))) throw new RangeError('Targets must contain one -1, 0, or 1 for each bar');
  const feeRate = settings.feeBps / 10_000;
  const slipRate = settings.slippageBps / 10_000;
  const barDuration = bars[1].time - bars[0].time;
  if (bars.some((bar, i) => i > 0 && bar.time - bars[i - 1].time !== barDuration)) throw new RangeError('Bars must be evenly spaced');
  const trades = [];
  const curve = [];
  let balance = settings.capital;
  let position = null;
  let fees = 0;
  let peak = balance;
  let maxDrawdown = 0;
  let exposedBars = 0;

  function closePosition(price, index, reason) {
    const exit = price * (1 - position.side * slipRate);
    const exitFee = position.quantity * exit * feeRate;
    const grossPnl = position.side * position.quantity * (exit - position.entry);
    balance += grossPnl - exitFee;
    fees += exitFee;
    trades.push({
      id: trades.length + 1, side: position.side, entryIndex: position.index,
      exitIndex: index, entryTime: bars[position.index].time,
      exitTime: bars[index].time + (reason === 'Window end' ? barDuration : 0),
      entry: position.entry, exit, quantity: position.quantity,
      notional: position.notional, grossPnl,
      fees: position.fee + exitFee, netPnl: grossPnl - position.fee - exitFee,
      returnPct: (grossPnl - position.fee - exitFee) / position.notional * 100,
      reason,
    });
    position = null;
  }

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const target = i > 0 ? signals[i - 1] : 0;
    if (position && position.side !== target) closePosition(bar.open, i, 'Signal');
    if (!position && target !== 0 && balance > 0) {
      const entry = bar.open * (1 + target * slipRate);
      const notional = Math.min(settings.positionSize, balance / (1 + feeRate));
      const fee = notional * feeRate;
      position = { side: target, entry, quantity: notional / entry, notional, fee, index: i };
      balance -= fee;
      fees += fee;
    }
    if (position) exposedBars++;
    // End-of-window liquidation makes trade totals reconcile to final equity.
    if (i === bars.length - 1 && position) closePosition(bar.close, i, 'Window end');
    const equity = balance + (position ? position.side * position.quantity * (bar.close - position.entry) : 0);
    peak = Math.max(peak, equity);
    const drawdown = (peak - equity) / peak * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    curve.push({ time: bar.time + barDuration, equity, drawdown });
  }
  const wins = trades.filter(trade => trade.netPnl > 0);
  const profits = wins.reduce((sum, trade) => sum + trade.netPnl, 0);
  const losses = -trades.filter(trade => trade.netPnl < 0).reduce((sum, trade) => sum + trade.netPnl, 0);
  return {
    settings, signals, trades, curve,
    metrics: {
      finalEquity: balance, netPnl: balance - settings.capital,
      returnPct: (balance / settings.capital - 1) * 100,
      maxDrawdown, fees, tradeCount: trades.length,
      winRate: trades.length ? wins.length / trades.length * 100 : 0,
      profitFactor: losses ? profits / losses : profits > 0 ? Infinity : null,
      exposurePct: exposedBars / bars.length * 100,
    },
  };
}

export function buyAndHold(bars, options = {}) {
  return backtest(bars, { ...options, targets: bars.map(() => 1) });
}

/** CSV contains closed trades, including both entry and exit costs. */
export function tradesToCsv(trades) {
  const header = ['id', 'side', 'entry_time_utc', 'exit_time_utc', 'entry_price', 'exit_price', 'quantity', 'notional_usd', 'gross_pnl_usd', 'fees_usd', 'net_pnl_usd', 'return_pct', 'exit_reason'];
  const rows = trades.map(t => [t.id, t.side === 1 ? 'LONG' : 'SHORT', new Date(t.entryTime).toISOString(), new Date(t.exitTime).toISOString(), t.entry.toFixed(8), t.exit.toFixed(8), t.quantity.toFixed(8), t.notional.toFixed(2), t.grossPnl.toFixed(4), t.fees.toFixed(4), t.netPnl.toFixed(4), t.returnPct.toFixed(4), t.reason]);
  return [header, ...rows].map(row => row.join(',')).join('\r\n') + '\r\n';
}
