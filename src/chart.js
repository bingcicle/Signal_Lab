const COLORS = { grid: '#2b2d34', text: '#858795', accent: '#f7a36b', benchmark: '#9996b5' };
const date = time => new Date(time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });

/** Lightweight, device-pixel-ratio-aware Canvas renderer. No charting dependency. */
export class EquityChart {
  constructor(canvas, tooltip) {
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.hover = null;
    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(canvas);
    canvas.addEventListener('pointermove', event => {
      if (!this.strategy) return;
      const rect = canvas.getBoundingClientRect();
      const index = Math.round((event.clientX - rect.left - 8) / (rect.width - 69) * (this.strategy.length - 1));
      this.hover = Math.max(0, Math.min(this.visible - 1, index));
      const point = this.strategy[this.hover];
      const benchmark = this.benchmark[this.hover];
      tooltip.textContent = `${date(point.time)} · ${new Date(point.time).toISOString().slice(11, 16)} UTC\nStrategy  $${point.equity.toFixed(2)}\nBuy/hold  $${benchmark.equity.toFixed(2)}`;
      tooltip.hidden = false;
      tooltip.style.left = `${Math.max(2, Math.min(rect.width - tooltip.offsetWidth - 4, event.clientX - rect.left + 12))}px`;
      tooltip.style.top = '10px';
      this.draw();
    });
    canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      tooltip.hidden = true;
      this.draw();
    });
  }

  setData(strategy, benchmark, visible = strategy.length) {
    this.strategy = strategy;
    this.benchmark = benchmark;
    this.visible = visible;
    this.hover = null;
    this.tooltip.hidden = true;
    this.draw();
  }

  draw() {
    if (!this.strategy) return;
    const canvas = this.canvas;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    const left = 8, top = 18, right = width - 61, bottom = height - 29;
    const values = [...this.strategy, ...this.benchmark].map(point => point.equity);
    const low = Math.min(...values), high = Math.max(...values);
    const padding = Math.max((high - low) * 0.15, 30);
    const min = low - padding, max = high + padding;
    const x = i => left + i / (this.strategy.length - 1) * (right - left);
    const y = value => bottom - (value - min) / (max - min) * (bottom - top);
    ctx.font = '9px Consolas, monospace';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const value = min + (max - min) * i / 4;
      const py = y(value);
      ctx.strokeStyle = COLORS.grid;
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(right, py); ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'left';
      ctx.fillText(`${(value / 1000).toFixed(2)}k`, right + 11, py + 3);
    }
    const ticks = width < 420 ? 3 : 5;
    for (let i = 0; i < ticks; i++) {
      const index = Math.round((this.strategy.length - 1) * i / (ticks - 1));
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = i === 0 ? 'left' : i === ticks - 1 ? 'right' : 'center';
      ctx.fillText(date(this.strategy[index].time), x(index), height - 8);
    }
    ctx.setLineDash([]);
    const points = this.strategy.slice(0, this.visible);
    const gradient = ctx.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, '#f7a36b21');
    gradient.addColorStop(1, '#f7a36b00');
    ctx.beginPath();
    points.forEach((point, i) => i ? ctx.lineTo(x(i), y(point.equity)) : ctx.moveTo(x(i), y(point.equity)));
    ctx.lineTo(x(points.length - 1), bottom); ctx.lineTo(left, bottom); ctx.closePath();
    ctx.fillStyle = gradient; ctx.fill();
    for (const [series, color, dashed] of [[this.benchmark, COLORS.benchmark, true], [this.strategy, COLORS.accent, false]]) {
      ctx.beginPath();
      ctx.lineWidth = dashed ? 1.3 : 1.8;
      ctx.strokeStyle = color;
      ctx.setLineDash(dashed ? [4, 4] : []);
      series.slice(0, this.visible).forEach((point, i) => i ? ctx.lineTo(x(i), y(point.equity)) : ctx.moveTo(x(i), y(point.equity)));
      ctx.stroke();
    }
    const last = points.length - 1;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x(last), y(points[last].equity), 3, 0, Math.PI * 2); ctx.fillStyle = COLORS.accent; ctx.fill();
    if (this.hover !== null) {
      const px = x(this.hover), py = y(this.strategy[this.hover].equity);
      ctx.strokeStyle = '#c3a99488'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bottom); ctx.stroke();
      ctx.setLineDash([]); ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fillStyle = COLORS.accent; ctx.fill();
    }
  }
}
