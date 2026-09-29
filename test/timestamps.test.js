import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMarket, backtest } from '../src/engine.js';

test('timestamps distinguish next-open execution from final-close liquidation', () => {
  const bars = generateMarket('BTC', 42, 3);
  const result = backtest(bars, { targets: [1, 1, 1], feeBps: 0, slippageBps: 0 });
  const trade = result.trades[0];
  assert.equal(trade.entryTime, bars[1].time);
  assert.equal(trade.exitTime, bars[2].time + 3_600_000);
  assert.equal(result.curve[0].time, bars[0].time + 3_600_000);
});

test('irregular bars are rejected instead of assigning a misleading close time', () => {
  const bars = generateMarket('BTC', 42, 3);
  bars[2].time += 1000;
  assert.throws(() => backtest(bars), /evenly spaced/);
});
