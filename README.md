# cbBTC minute momentum bot — make.fun BTC race

Entry for make.fun's **Race a BTC trading bot live for 24 hours**
(`btc-race-24h-20261113-2314`). It trades Coinbase Wrapped BTC (cbBTC) against USDC with $1,000 of
paper money over a replay of 1-minute on-chain Orca Whirlpool bars, speaking the
`agent-fun/bars-replay/v1` line protocol.

## What it does

Long only, one position at a time:

- **Enter** when the last closed minute moved more than **30 bps up** *and* the 5-minute drift is also
  up — i.e. only when a large move is part of a push, not a lone wick.
- **Exit** when the last closed minute moved more than **20 bps down** (a momentum stop). Anything
  still held at the end of the window is flattened by the replay at the last close.
- Slippage tolerance is 60 bps from the latest close; the modelled 2 bps and the order's price impact
  both count toward it.

## Why so few trades

The replay charges roughly **26 bps for a full round trip** (4 bps fee each way, 2 bps slippage each
way, plus the order's constant-product price impact on the pool). On a 24-hour sample of 1-minute
cbBTC bars the median absolute minute move is about 3.5 bps and only ~3% of minutes move more than
25 bps, so a bot that chases every wiggle pays the round trip far more often than it catches a move
that covers it. The 30 bps threshold above is what survived that arithmetic.

## Local result (dev window)

Graded with the competition kit, `grade-local` on the published dev window (1,440 one-minute bars,
cbBTC fell ~490 bps over the day):

| | |
|---|---|
| Net PnL | **+13.21 USDC** (+1.32%) |
| Trades | 4 |
| Max drawdown | 1.07% |
| Fees | 1.60 USDC |
| Net PnL at 2× fees | +11.60 USDC |
| Two runs | action logs identical (byte for byte) |

## Honest caveats

- Four trades on one window is a small sample. The second half of the dev window produces no trade.
- The edge is **not robust** across neighbouring settings: 25/20 bps makes +0.06%, 20/20 loses 0.9%,
  15/15 loses about 1%.
- A momentum strategy like this only clears the dev gate because the dev day had a few large
  up-pushes it could ride. The race window is a different 24 hours and nothing here predicts it.
- This is a research toy, not investment advice, and no real money is traded anywhere.

## Running it

The bot is `main.ts` (Node 22, erasable TypeScript only, standard library plus the vendored protocol
shim in `vendor/makefun-bars.ts`, which is a byte-identical copy of the kit's `sdk/makefun-bars.ts`).
It reads one JSON line per minute on stdin and writes exactly one reply per batch on stdout.

```sh
node cli/makefun.mjs grade-local --kit . --bot <this repo> --driver process
```

## Transcripts

See `TRANSCRIPTS.md`: the build sessions behind this entry are handed over as exported session
files because the agent that built it (Hermes Agent on Android/Termux) keeps no session log the
bundler can read for this repository.

## License

MIT — see `LICENSE`.
