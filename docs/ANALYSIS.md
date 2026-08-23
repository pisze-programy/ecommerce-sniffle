# Analysis model

This document explains how we turn stock snapshots into sales and restock numbers.
It uses Simplified Technical English.

## Input

A snapshot is the state of all variants of one shop at one moment.
Snapshots happen on a schedule. The default is twice a day:

- morning (06:00)
- evening (20:00)

Each variant in a snapshot has:

- quantity (exact number, or null when the shop does not track stock)
- price
- regular price
- availability (true or false)

## The base equation

For one variant between two snapshots:

```
stock(t) = stock(t-1) + received(t) - sold(t)
```

We cannot see `received` (restock and returns) directly.
We only see two stock values.

## Classification of a change

We compare the previous state with the current state.

| Change | Classification | Confidence |
|---|---|---|
| quantity decreased | sold = previous - current | exact |
| quantity decreased and a restock could hide sales | sold = previous - current | lower-bound |
| quantity increased | restock = current - previous; sales unknown | masked |
| quantity unchanged, price decreased (regular > price) | promo start | exact |
| quantity unchanged, price increased to regular | promo end | exact |
| quantity unchanged, price unchanged | no change | exact |
| availability true -> false | sold out | exact (unit count unknown if untracked) |
| availability false -> true | back in stock | exact |
| new product appears | product new | exact |
| product disappears | product removed | exact |

## The honest limitation

If a restock happens inside one window, sales are masked.
Example:

- morning: 10
- evening: 12
- real events: sold 3, restock +5

The visible change is +2.
We record a restock of +5 and mark sales as unknown.
We never show a fake sales number for a masked window.

This is why every number carries a confidence level.

## Revenue

- revenue = sold units x price from the sale snapshot
- when a promo is active, the sale price is the promo price
- revenue is an estimate, not an exact order value

## Daily statistics

For one shop and one day, we aggregate:

- unitsSold (lower bound): sum of sold units from non-masked events
- revenue: sum of sold units x price
- restocked: sum of restock units
- soldOutCount: products that reached zero
- promotionCount: variants with an active price drop
- maskedCount: variants where sales are unknown because of restock

## Time resolution

Events are detected at snapshot boundaries.
We do not know the exact minute of a sale.
The report shows the window (morning or evening), not a precise time.

## Output shape

The diff engine returns events.
The aggregation returns daily statistics.
The API serves these shapes to the UI.

See packages/analysis for the implementation.
See public/daily-report.html for the MVP layout.
