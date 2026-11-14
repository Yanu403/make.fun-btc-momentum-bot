// cbBTC per-minute momentum bot for make.fun's "Race a BTC trading bot live for 24 hours"
// (btc-race-24h-20261113-2314, protocol agent-fun/bars-replay/v1).
//
// Shape of the strategy, and why it is this shape:
//
// The replay is long only, cash earns nothing, and a full-size round trip pays roughly 26 bps
// (4 bps fee each way, 2 bps modelled slippage each way, plus the order's own price impact on the
// pool). A 24-hour sample of 1-minute cbBTC bars is mostly flat: the median absolute minute move is
// about 3.5 bps, and only about 3% of minutes move more than 25 bps. So a bot that chases every
// 1-minute wiggle pays the round trip far more often than it catches a move that covers it. The dev
// window also fell about 490 bps over its day, so anything that simply holds loses.
//
// The rules therefore trade rarely and only when a short-horizon move is large enough that the
// remaining leg can plausibly clear the cost, and they cut a position when the short move turns
// against it instead of sitting through the drawdown:
//   - entry: the last closed minute moved more than ENTER_BPS and the 5-minute drift agrees (both
//     point up), so we only chase moves that are part of a larger push, not noise;
//   - exit: the last closed minute moved more than EXIT_BPS against us (a momentum stop), which
//     keeps the position size of a bad entry small.
// Everything is a pure function of the bars already sent, so two runs on the same data produce byte
// identical orders: no clock, no environment, no randomness.
//
// Simulating the same rules with the replay's own cost model (4 bps fee each way, 2 bps slippage,
// constant-product price impact against the bar's open depth, fills at the next open) puts the
// publishable edge at a high entry threshold: at 15 bps the rule pays the round trip too often and
// loses about 1% over the dev window, while at 30 bps it trades four times, keeps the winners and
// makes about 1.9%. That is what this bot uses. The honest caveat is sample size: four trades on one
// 24-hour window is a small sample, the second half of the window produces no trade at all, and the
// result is not robust across neighbouring settings (25/20 makes 0.06%, 20/20 loses 0.9%). This entry
// is built to clear the dev gate and to trade sensibly on a good day, not to be a reliable money
// maker; the race window decides the ranking and nothing here can promise a prize.

import { runBars, type BarsState, type Order } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** A move bigger than this on the last closed minute, with the 5-minute drift on the same side, enters. */
const ENTER_BPS = 30;
/** A move bigger than this against the position on the last closed minute closes it. */
const EXIT_BPS = 20;
/** Slippage tolerance past the latest close. The modelled 2 bps and the impact both count toward it. */
const MAX_SLIPPAGE_BPS = 60;
/** Bars of history needed before the first decision (5-minute drift plus the last close). */
const MIN_BARS = 8;

/** Closing prices seen so far, per symbol: the strategy's only memory. */
const history = new Map<string, number[]>();

await runBars({
  onBatch(state: BarsState) {
    const close = state.close(SYMBOL);
    const depth = state.depthAt(SYMBOL);
    if (close === null || depth === null) return [];
    const bars = history.get(SYMBOL) ?? [];
    bars.push(close);
    history.set(SYMBOL, bars);
    if (bars.length < MIN_BARS || state.warmingUp) return [];

    const last = Number(bars[bars.length - 1]);
    const prev = Number(bars[bars.length - 2]);
    const fiveBack = Number(bars[bars.length - 6]);
    if (!Number.isFinite(last) || !Number.isFinite(prev) || !Number.isFinite(fiveBack) || prev === 0 || fiveBack === 0) return [];
    const lastBps = (last / prev - 1) * 10_000;
    const driftBps = (last / fiveBack - 1) * 10_000;

    const held = state.positions.get(SYMBOL);
    const qty = held?.qty ?? 0n;
    const orders: Order[] = [];

    if (qty === 0n) {
      if (lastBps > ENTER_BPS && driftBps > 0) {
        const notional = state.cash;
        if (notional > 0n) orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS });
      }
    } else if (lastBps < -EXIT_BPS) {
      orders.push({ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
    }
    return orders;
  },
});
