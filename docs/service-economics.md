# Service economics: explicit assumptions, reproducible arithmetic

This offline calculator supports studio-tracker #193. It evaluates hypothetical
USD service scenarios; it does not create invoices, fetch rates, record actual
payments, contact customers or bill usage. No new dependency is required.

```sh
node bin/service-economics.js --all
node bin/service-economics.js --scenario setup-loaded --json
node bin/service-economics.js --input /path/to/scenario.json --json
npm test
```

Copy one entry from [the scenario file](../examples/service-scenarios.json) to
edit assumptions. The input limit is 64 KiB. Money must be nonnegative integer
USD cents, time integer minutes and rates integer basis points (`100` = 1%).
The schema, `hypothetical: true`, USD currency and `one-time`/`annual` period are
required. Unknown fields and unsafe integer inputs/results are rejected. JSON
output includes every input so a result can be traced back to its assumptions.

## What the numbers mean

All per-unit fields refer to one job or one annual account. `units` is a chosen
scenario volume, never a sales forecast. `availableMinutes` and
`fixedPeriodCents` apply to the entire same cohort/year. Reserve time for fixed
development, administration, vacation and other work **before** setting available
minutes. Do not add multiple product scenarios while counting the same fixed
costs or available hours more than once.

| Input group | Meaning |
| --- | --- |
| `priceCents` | Gross service fee, excluding pass-through sales tax and artist funds. |
| `refundBps` | Planning reserve as a share of gross revenue; not an actual refund or customer count. |
| `paymentFeeBps`, `paymentFeeFixedCents` | Hypothetical collection cost per unit; no provider rate is implied. The original fee remains even if a refund is assumed. |
| `refundHandlingCents` | Expected additional refund-handling cost per unit, already weighted by the user's assumption; charged in every modeled unit, not automatically multiplied by refund probability. |
| `hourlyLaborCents`, delivery/support minutes | Cost of the owner's or contractor's time, including unpaid work. A zero wage is an assumption, not free labor. |
| Infrastructure/materials/other variable cents | Expected delivery costs per job/year, without double-counting fixed overhead. |
| Acquisition minutes/cash cents | Sales effort and cash cost allocated per won customer, including failed leads. |
| Fixed-period cents | Development/admin/other fixed costs for this scenario period, counted once. |

The formulas are:

- Net planned revenue = gross fee − refund reserve.
- Delivery contribution = net planned revenue − payment costs − expected refund
  handling − delivery/support labor − infrastructure/materials/other variable costs.
- Contribution after acquisition = delivery contribution − acquisition labor/cash.
- Period surplus before tax = units × contribution after acquisition − fixed costs.
- Fixed-cost break-even units = fixed costs ÷ positive contribution after
  acquisition, rounded up. With no fixed cost the threshold is zero; this does
  not make loss-making additional jobs viable. A nonpositive contribution with
  positive fixed costs has no finite break-even volume.
- Capacity = available minutes ÷ total delivery, support and acquisition minutes
  per unit, rounded down. Zero modeled time gives `null`, meaning unmeasured.

The [SBA break-even guide](https://legacy.sba.gov/business-guide/plan-your-business/calculate-your-startup-costs/break-even-point)
uses fixed costs and unit contribution to estimate break-even. This calculator
adds explicit acquisition and time-capacity checks. Its output is a simplified
planning model, not a financial statement, cash-flow forecast or evidence of
demand. It omits timing of receipts, churn/renewals, financing and taxes. Salaried
or contractor labor cost classification must be chosen consistently for the
real operation; modeled owner time is not a claim that wages were paid.

Rate amounts round half up to cents per unit. Each labor bucket rounds up to
cents per unit. Totals multiply those rounded per-unit amounts. BigInt is used
for intermediate multiplication, and unsafe output numbers fail instead of
silently losing precision. Dollar formatting also avoids floating-point cent
rounding. Negative contribution/surplus is retained.

## Reproduce the issue and stress its assumptions

All amounts below are hypothetical, including the $50/hour labor cost, 3%
payment fee plus $0.30, and refund reserves. They are not vendor quotes.

| Scenario | Delivery contribution/unit | After acquisition/unit | Units chosen | Period surplus before tax | Time cap |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hosting issue baseline | $104.00 | $104.00 | 100 | $10,400.00 | 100 |
| Hosting with four support hours | $4.00 | $4.00 | 100 | $400.00 | 50 |
| Setup issue baseline | $270.00 | $270.00 | 5 | $1,350.00 | 6 |
| Curation issue baseline | $500.00 | $500.00 | 1 | $500.00 | 2 |
| Hosting with added costs | $84.50 | $49.50 | 100 | $1,950.00 | 80 |
| Hosting added costs, four support hours | −$15.50 | −$50.50 | 100 | −$8,050.00 | 44 |
| Setup with added costs | $171.70 | $96.70 | 5 | −$2,016.50 | 5 |
| Curation with added costs | $309.70 | $109.70 | 1 | −$890.30 | 1 |

The first four reproduce the issue's simple examples and intentionally assume
zero acquisition, collection, refund and fixed costs. They are incomplete
business cases. The later rows add explicit costs in the scenario JSON:

- Hosting: 5% refund reserve, collection fee, 30 minutes and $10 acquisition per
  account, $3,000 fixed annual costs. It needs 61 accounts for modeled fixed-cost
  break-even, but the chosen 100 exceed the 80-account time cap. A positive
  arithmetic surplus at impossible volume is not an executable plan.
- Setup: 5% reserve, collection fee, one support hour, one acquisition hour plus
  $25, and $2,500 fixed cohort costs. Twenty-six jobs would cover those fixed
  costs under the model, but the time budget only fits five.
- Curation: 3% reserve, collection fee, two support hours, three acquisition hours
  plus $50, and $1,000 fixed cohort costs. The resulting ten-show break-even
  threshold exceeds the one-show time cap.

Use the [interview/delivery plan](optional-services.md) to measure actual
time and scope before changing prices or expanding capacity. Vary one input at
a time to understand its effect, then test plausible combinations. A calculated
break-even point never proves that anyone wants the service.

## Verification and remaining evidence

Tests reproduce all three original economics examples and doubled support,
exercise fees/refunds/acquisition/capacity/break-even, check partial-cent
rounding, zero jobs and unknown time, and reject unsupported billing fields and
unsafe arithmetic. CLI tests cover scenario selection, bounded file input,
malformed arguments/JSON and exact large-cent formatting.

The outstanding work is five willing interviewees, five separately authorized
pilot jobs, actual provider/support costs, viable service terms and production
readiness. This PR contains none of those observations. The revenue issue must
remain open until those outcomes are assessed honestly.
