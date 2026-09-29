import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMarket, createTargets, backtest, buyAndHold, tradesToCsv } from '../src/engine.js';

const bars = prices => prices.map((price, i) => ({ time: Date.UTC(2026, 0, 1) + i * 3_600_000, open: price, high: price, low: price, close: price }));
const simple = { capital: 10_000, positionSize: 1000, feeBps: 0, slippageBps: 0 };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('same market and seed reproduce every bar; changing seed changes data', () => {
  assert.deepEqual(generateMarket('BTC', 42), generateMarket('BTC', 42));
  assert.notDeepEqual(generateMarket('BTC', 42), generateMarket('BTC', 43));
});

test('generating more data does not rewrite existing bars', () => {
  assert.deepEqual(generateMarket('ETH', 9, 100), generateMarket('ETH', 9, 200).slice(0, 100));
});

test('all generated markets have positive, consistent hourly OHLC bars', () => {
  for (const market of ['BTC', 'ETH', 'SOL', 'HYPE']) {
    const data = generateMarket(market);
    for (let i = 0; i < data.length; i++) {
      const b = data[i];
      assert.ok(b.low > 0 && b.low <= b.open && b.low <= b.close);
      assert.ok(b.high >= b.open && b.high >= b.close);
      if (i) assert.equal(b.time - data[i - 1].time, 3_600_000);
    }
  }
});

for (const strategy of ['trend', 'reversion', 'breakout']) {
  test(`${strategy}: future candles cannot change earlier targets`, () => {
    const data = generateMarket('SOL', 11, 300);
    const original = createTargets(data, strategy);
    const changed = data.map((b, i) => i < 180 ? b : ({ ...b, open: b.open * 5, high: b.high * 5, low: b.low * 5, close: b.close * 5 }));
    assert.deepEqual(createTargets(changed, strategy).slice(0, 180), original.slice(0, 180));
    assert.deepEqual(createTargets(data.slice(0, 180), strategy), original.slice(0, 180));
  });
}

test('an order executes at the next open, never at the signal close', () => {
  const result = backtest(bars([100, 120, 120]), { ...simple, targets: [1, 1, 0] });
  assert.equal(result.trades[0].entryIndex, 1);
  assert.equal(result.trades[0].entry, 120);
  assert.equal(result.curve[0].equity, simple.capital);
});

test('long P&L matches a hand calculation', () => {
  const result = backtest(bars([100, 100, 110]), { ...simple, targets: [1, 1, 1] });
  near(result.metrics.netPnl, 100);
  assert.equal(result.trades[0].reason, 'Window end');
});

test('short P&L matches a hand calculation', () => {
  const result = backtest(bars([100, 100, 90]), { ...simple, targets: [-1, -1, -1] });
  near(result.metrics.netPnl, 100);
});

test('fees apply to both executed notionals', () => {
  const result = backtest(bars([100, 100, 110]), { ...simple, feeBps: 10, targets: [1, 1, 1] });
  near(result.metrics.fees, 2.1);
  near(result.metrics.netPnl, 97.9);
});

test('slippage is adverse on entry and exit for either side', () => {
  for (const side of [1, -1]) {
    const result = backtest(bars([100, 100, 100]), { ...simple, slippageBps: 10, targets: [side, side, side] });
    const trade = result.trades[0];
    near(trade.entry, 100 * (1 + side * .001));
    near(trade.exit, 100 * (1 - side * .001));
    assert.ok(trade.netPnl < 0);
  }
});

test('reversals close the previous position before opening the new one', () => {
  const result = backtest(bars([100, 100, 110, 100]), { ...simple, targets: [1, -1, 0, 0] });
  assert.equal(result.trades.length, 2);
  assert.equal(result.trades[0].exitIndex, result.trades[1].entryIndex);
  near(result.metrics.netPnl, 100 + 1000 / 110 * 10);
});

test('position notional plus its entry fee cannot exceed available equity', () => {
  const result = backtest(bars([100, 100, 100]), { ...simple, capital: 100, feeBps: 10, targets: [1, 1, 1] });
  near(result.trades[0].notional * 1.001, 100);
});

test('flat targets preserve capital and produce defined zero-trade metrics', () => {
  const result = backtest(bars([100, 120, 90]), { ...simple, targets: [0, 0, 0] });
  near(result.metrics.finalEquity, simple.capital);
  assert.equal(result.metrics.tradeCount, 0);
  assert.equal(result.metrics.winRate, 0);
  assert.equal(result.metrics.profitFactor, null);
  assert.equal(result.metrics.fees, 0);
});

test('drawdown uses the running equity peak and includes the last close', () => {
  const result = backtest(bars([100, 100, 110, 90]), { ...simple, targets: [1, 1, 1, 1] });
  near(result.metrics.maxDrawdown, 200 / 10_100 * 100);
});

test('every closed-trade P&L reconciles to final portfolio equity', () => {
  for (const strategy of ['trend', 'reversion', 'breakout']) {
    const result = backtest(generateMarket('HYPE', 123), { strategy });
    near(result.trades.reduce((sum, trade) => sum + trade.netPnl, 0), result.metrics.netPnl);
    near(result.trades.reduce((sum, trade) => sum + trade.fees, 0), result.metrics.fees);
    near(result.curve.at(-1).equity, result.metrics.finalEquity);
  }
});

test('benchmark uses the same size and cost assumptions', () => {
  const result = buyAndHold(bars([100, 100, 110]), { ...simple, feeBps: 10 });
  assert.equal(result.trades.length, 1);
  near(result.metrics.netPnl, 97.9);
});

test('invalid market data and invalid settings fail explicitly', () => {
  assert.throws(() => generateMarket('UNKNOWN'), /Unknown market/);
  assert.throws(() => generateMarket('BTC', 1.5), /Invalid seed/);
  assert.throws(() => backtest([]), /At least two/);
  assert.throws(() => backtest(bars([100, -1])), /Prices/);
  assert.throws(() => backtest(bars([100, 100]).reverse()), /timestamps/);
  assert.throws(() => backtest(bars([100, 100]), { feeBps: -1 }), /feeBps/);
  assert.throws(() => backtest(bars([100, 100]), { capital: NaN }), /capital/);
  assert.throws(() => backtest(bars([100, 100]), { targets: [2, 0] }), /Targets/);
  assert.throws(() => createTargets(bars([100, 100]), 'made-up'), /Unknown strategy/);
});

test('CSV includes full precision fills and both-side fees', () => {
  const result = backtest(bars([100, 100, 110]), { ...simple, feeBps: 10, targets: [1, 1, 1] });
  const csv = tradesToCsv(result.trades);
  const rows = csv.trim().split('\r\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].split(',').length, rows[1].split(',').length);
  assert.match(rows[1], /100\.00000000,110\.00000000/);
  assert.match(rows[1], /2\.1000,97\.9000/);
});
