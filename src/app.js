import { DEFAULTS, MARKETS, STRATEGIES } from './config.js';
import { generateMarket, backtest, buyAndHold, tradesToCsv } from './engine.js';
import { EquityChart } from './chart.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const money = (value, digits = 2) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
const signedMoney = value => `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`;
const percent = value => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}%`;
const date = time => new Date(time).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false });
const STORAGE_KEY = 'signal-lab-v1';

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== 'object') return { ...DEFAULTS };
    const valid = { ...DEFAULTS };
    if (Object.hasOwn(MARKETS, saved.market)) valid.market = saved.market;
    if (Object.hasOwn(STRATEGIES, saved.strategy)) valid.strategy = saved.strategy;
    if ([7, 14, 30].includes(saved.days)) valid.days = saved.days;
    if (Number.isInteger(saved.seed) && saved.seed >= 0 && saved.seed <= 0xFFFFFFFF) valid.seed = saved.seed;
    if (Number.isInteger(saved.positionSize) && saved.positionSize >= 1000 && saved.positionSize <= 20000 && saved.positionSize % 1000 === 0) valid.positionSize = saved.positionSize;
    for (const field of ['feeBps', 'slippageBps']) {
      if (Number.isInteger(saved[field]) && saved[field] >= 0 && saved[field] <= 50) valid[field] = saved[field];
    }
    return valid;
  } catch { return { ...DEFAULTS }; }
}

let state = loadSettings();
let result, benchmark, bars;
let timer = null, toastTimer = null;
let visible = 720;
let showAll = false;
const chart = new EquityChart($('#equity-chart'), $('#chart-tooltip'));

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 2500);
}

function sparkline(data, positive) {
  const values = data.filter((_, i) => i % 12 === 0).map(bar => bar.close);
  const low = Math.min(...values), spread = Math.max(...values) - low || 1;
  const points = values.map((value, i) => `${(i / (values.length - 1) * 100).toFixed(1)},${(35 - (value - low) / spread * 30).toFixed(1)}`).join(' ');
  return `<svg class="sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${positive ? '#88cfad' : '#e78e94'}" stroke-width="1.3" vector-effect="non-scaling-stroke"/></svg>`;
}

function renderMarkets() {
  $('#markets').innerHTML = Object.entries(MARKETS).map(([symbol, market]) => {
    const data = generateMarket(symbol, state.seed).slice(-state.days * 24);
    const price = data.at(-1).close;
    const change = (price / data[0].open - 1) * 100;
    return `<button class="market-card" type="button" data-market="${symbol}" aria-pressed="${symbol === state.market}" aria-label="Select ${market.name} synthetic market"><span class="market-card-top"><span class="coin-icon" style="--coin:${market.color};--coin-bg:${market.color}18">${market.symbol}</span><span class="market-symbol">${symbol}<span class="market-pair">/ USD</span></span><span class="market-selected"></span></span><span class="market-price">${money(price)}</span><span class="market-change ${change >= 0 ? 'positive' : 'negative'}">${percent(change)} <small>${state.days}D</small></span>${sparkline(data, change >= 0)}</button>`;
  }).join('');
}

function renderStrategies() {
  $('#strategies').innerHTML = Object.entries(STRATEGIES).map(([key, strategy]) => `<button class="strategy-button" type="button" data-strategy="${key}" aria-pressed="${key === state.strategy}"><span class="radio-dot"></span>${strategy.name}<span class="strategy-tag">${strategy.tag}</span></button>`).join('');
  $('#strategy-description').textContent = STRATEGIES[state.strategy].description;
}

function syncInputs() {
  $('#starting-capital').textContent = money(state.capital, 0);
  $('#position-size').value = state.positionSize;
  $('#position-output').textContent = money(state.positionSize, 0);
  $('#fee').value = state.feeBps;
  $('#slippage').value = state.slippageBps;
  $$('#periods button').forEach(button => button.setAttribute('aria-pressed', Number(button.dataset.days) === state.days));
  renderStrategies();
}

function readInputs() {
  for (const input of [$('#fee'), $('#slippage')]) {
    if (!input.checkValidity() || input.value === '') { input.reportValidity(); input.focus(); return false; }
  }
  state.positionSize = Number($('#position-size').value);
  state.feeBps = Number($('#fee').value);
  state.slippageBps = Number($('#slippage').value);
  return true;
}

function stopReplay() {
  clearInterval(timer);
  timer = null;
  $('#replay').innerHTML = '<svg><use href="#i-play"/></svg>';
  $('#replay').setAttribute('aria-label', 'Replay equity curve');
  $('#replay').title = 'Replay equity curve';
}

function drawReplay() {
  chart.setData(result.curve, benchmark.curve, visible);
  $('#equity-value').textContent = money(result.curve[visible - 1].equity);
  $('#timeline').value = visible;
  $('#replay-step').textContent = `${visible} / ${bars.length}`;
}

function renderTrades() {
  const reversed = [...result.trades].reverse();
  const trades = showAll ? reversed : reversed.slice(0, 5);
  $('#trade-rows').innerHTML = trades.length ? trades.map(trade => `<tr><td>#${String(trade.id).padStart(3, '0')}</td><td><span class="side-badge ${trade.side === 1 ? 'side-long' : 'side-short'}">${trade.side === 1 ? '↗ LONG' : '↘ SHORT'}</span></td><td>${date(trade.entryTime)}</td><td>${money(trade.entry)}</td><td>${money(trade.exit)}</td><td class="${trade.netPnl >= 0 ? 'positive' : 'negative'}">${signedMoney(trade.netPnl)}</td><td class="exit-reason">${trade.reason}</td></tr>`).join('') : '<tr><td colspan="7" class="empty-state">No closed trades in this window. Try a different strategy or scenario.</td></tr>';
  $('#journal-count').textContent = result.trades.length;
  $('#trade-summary').textContent = `Showing ${trades.length} of ${result.trades.length} trades · Latest first`;
  $('#show-trades').hidden = result.trades.length <= 5;
  $('#show-trades').innerHTML = `${showAll ? 'Show latest 5' : 'Show all trades'} <svg><use href="#i-chevron"/></svg>`;
  $('#export').disabled = result.trades.length === 0;
}

function run(notify = false) {
  if (!readInputs()) return;
  stopReplay();
  bars = generateMarket(state.market, state.seed).slice(-state.days * 24);
  result = backtest(bars, state);
  benchmark = buyAndHold(bars, state);
  visible = bars.length;
  showAll = false;
  const metrics = result.metrics;
  $('#net-pnl').textContent = signedMoney(metrics.netPnl);
  $('#net-pnl').className = metrics.netPnl >= 0 ? 'positive' : 'negative';
  $('#net-return').textContent = `${percent(metrics.returnPct)} on starting capital`;
  $('#win-rate').textContent = `${metrics.winRate.toFixed(1)}%`;
  $('#win-detail').textContent = `${result.trades.filter(trade => trade.netPnl > 0).length} winners / ${metrics.tradeCount} trades`;
  $('#drawdown').textContent = `−${metrics.maxDrawdown.toFixed(2)}%`;
  $('#trade-count').textContent = metrics.tradeCount;
  $('#fees').textContent = `${money(metrics.fees)} in total fees`;
  $('#chart-range').textContent = `${bars.length} hourly bars · UTC`;
  $('#exposure').textContent = `${metrics.exposurePct.toFixed(0)}% time in market`;
  $('#timeline').max = bars.length;
  const delta = metrics.netPnl - benchmark.metrics.netPnl;
  $('#insight-text').textContent = `${STRATEGIES[state.strategy].name} ${delta >= 0 ? 'beat' : 'trailed'} buy & hold by ${money(Math.abs(delta))} in this scenario. Change the costs and test again.`;
  $('#run-status').textContent = `Seed ${state.seed} · ${STRATEGIES[state.strategy].name} · Run complete`;
  $('#equity-chart').setAttribute('aria-label', `${state.market}, ${state.days}-day synthetic backtest. Final strategy equity ${money(metrics.finalEquity)}; buy and hold ${money(benchmark.metrics.finalEquity)}. Replay only changes the chart; totals are for the complete run.`);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Storage may be unavailable in private browsing. */ }
  renderMarkets();
  renderTrades();
  drawReplay();
  if (notify) toast(`Backtest complete · ${metrics.tradeCount} closed trades`);
}

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function newScenario() {
  if (!readInputs()) return;
  state.seed = (state.seed + 1) >>> 0;
  run();
  toast(`New synthetic scenario · Seed ${state.seed}`);
}

$('#markets').addEventListener('click', event => {
  const button = event.target.closest('[data-market]');
  if (!button || !readInputs()) return;
  state.market = button.dataset.market;
  run();
});
$('#strategies').addEventListener('click', event => {
  const button = event.target.closest('[data-strategy]');
  if (!button) return;
  state.strategy = button.dataset.strategy;
  renderStrategies();
  $('#run-status').textContent = 'Settings changed. Run to apply.';
});
$('#periods').addEventListener('click', event => {
  const button = event.target.closest('[data-days]');
  if (!button || !readInputs()) return;
  state.days = Number(button.dataset.days);
  syncInputs();
  run();
});
$('#position-size').addEventListener('input', () => {
  $('#position-output').textContent = money(Number($('#position-size').value), 0);
  $('#run-status').textContent = 'Settings changed. Run to apply.';
});
for (const input of [$('#fee'), $('#slippage')]) input.addEventListener('input', () => { $('#run-status').textContent = 'Settings changed. Run to apply.'; });
$('#run').addEventListener('click', () => run(true));
$('#new-scenario').addEventListener('click', newScenario);
$('#show-trades').addEventListener('click', () => { showAll = !showAll; renderTrades(); });
$('#export').addEventListener('click', () => {
  const settings = result.settings;
  download(tradesToCsv(result.trades), `signal-lab-${settings.market}-${settings.strategy}-seed-${settings.seed}.csv`, 'text/csv;charset=utf-8');
  toast('Trade journal exported');
});
$('#download-run').addEventListener('click', () => {
  const runData = { version: '1.0.0', dataType: 'synthetic', settings: result.settings, metrics: result.metrics, benchmark: benchmark.metrics, bars, trades: result.trades };
  download(JSON.stringify(runData, (_key, value) => value === Infinity ? 'Infinity' : value, 2), `signal-lab-run-${result.settings.seed}.json`, 'application/json');
  toast('Reproducible run exported');
});
$('#replay').addEventListener('click', () => {
  if (timer) { stopReplay(); return; }
  if (visible >= bars.length) visible = 2;
  $('#replay').innerHTML = '<svg><use href="#i-pause"/></svg>';
  $('#replay').setAttribute('aria-label', 'Pause equity replay');
  $('#replay').title = 'Pause equity replay';
  drawReplay();
  timer = setInterval(() => {
    visible = Math.min(bars.length, visible + Math.max(1, Math.round(bars.length / 120)));
    drawReplay();
    if (visible === bars.length) stopReplay();
  }, 50);
});
$('#timeline').addEventListener('input', event => { stopReplay(); visible = Number(event.target.value); drawReplay(); });
$$('[data-method]').forEach(button => button.addEventListener('click', () => $('#method-dialog').showModal()));
$('#close-dialog').addEventListener('click', () => $('#method-dialog').close());
$('#method-dialog').addEventListener('click', event => {
  const rect = event.currentTarget.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
});
$('#reset').addEventListener('click', () => {
  state = { ...DEFAULTS };
  syncInputs(); run(); toast('Workspace reset to defaults');
});
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || $('#method-dialog').open) return;
  if (event.key.toLowerCase() === 'r') run(true);
  if (event.key.toLowerCase() === 'n') newScenario();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopReplay(); });
syncInputs();
run();
