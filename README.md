# Kiko Leaps the Night Market

[![make.fun](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/Nr1414-dev/ai-judge-excited-kiko-leap/rank.svg)](https://make.fun/bounty/ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/Nr1414-dev/ai-judge-excited-kiko-leap/reward.svg)](https://make.fun/bounty/ai-excited-01)

An entry for [Make the AI judge excited](https://make.fun/bounty/ai-excited-01) on make.fun.

## What it is

A small blue steam train, Kiko, leaps diagonally over a broken gap in the railway
high above a night market — golden comet sparks streaming behind him, a huge glowing
full moon, a ferris-wheel silhouette, strings of lanterns, and a smoke spiral curling
up from his chimney and dissolving into stars. No text anywhere in the image.

The image is drawn pixel by pixel in code: `main.ts` renders the whole scene into a
1024×1024 RGB buffer and writes it out with a hand-written PNG encoder. Node
standard library only, fully deterministic — a fixed seed drives every star,
lantern, spark and crater, so every run produces byte-identical output.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024×1024, about 390 KB, well under the 1 MiB limit).

## Referral

Built with make.fun — join with my referral code `mzt460aw`: https://make.fun/r/mzt460aw
