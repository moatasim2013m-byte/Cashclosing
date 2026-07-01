# Nexus Cashier → Cashclosing — API JSON Format

This is the JSON format our reconciliation app expects from the POS API.
Please expose **one endpoint** that returns a full daily report for a given date.

## Endpoint (suggested)

```
GET  https://<your-host>/api/v1/reports/daily?date=YYYY-MM-DD&site_id=<id>
Header:  Authorization: Bearer <API_KEY>
Returns: application/json
```

- One call per **date** (and per **shift** if you split shifts) returns everything below.
- All money values are plain numbers (no currency symbols, no thousands separators). Use `.` for decimals.
- Dates are `YYYY-MM-DD`. Timestamps are ISO-8601 (`2026-07-01T21:30:00+03:00`).

---

## Full response

```json
{
  "site_id": "STORE-01",
  "site_name": "FAPSS Main",
  "report_date": "2026-07-01",
  "shift": "Night",
  "generated_at": "2026-07-01T23:59:00+03:00",
  "currency": "JOD",

  "sales": {
    "z_report_total": 1450.00,
    "gross_sales": 1500.00,
    "net_sales": 1450.00,
    "refunds": 20.00,
    "discounts": 30.00,

    "by_payment_method": {
      "cash": 900.00,
      "visa": 400.00,
      "transfer_cliq": 100.00,
      "card_wallet": 50.00
    },

    "by_category": [
      { "category": "Games",         "amount": 1000.00, "qty": 320 },
      { "category": "Toys",          "amount": 150.00,  "qty": 12  },
      { "category": "Birthdays",     "amount": 200.00,  "qty": 2   },
      { "category": "Subscriptions", "amount": 80.00,   "qty": 4   },
      { "category": "Food",          "amount": 20.00,   "qty": 5   }
    ],

    "unpaid_debt": 0.00
  },

  "cards": {
    "activations_count": 18,
    "total_topup_amount": 620.00,
    "total_outstanding_balance": 3400.00,
    "activations": [
      { "card_id": "0004AB12", "activated_at": "2026-07-01T18:05:00+03:00", "initial_load": 20.00 }
    ],
    "topups": [
      { "card_id": "0004AB12", "amount": 10.00, "payment_method": "cash", "time": "2026-07-01T19:40:00+03:00" }
    ]
  },

  "loyalty": {
    "points_earned": 1250,
    "points_redeemed": 300,
    "points_balance_total": 48200,
    "members": [
      {
        "member_id": "M-1001",
        "name": "Sara A.",
        "phone": "+9627xxxxxxxx",
        "points_earned": 40,
        "points_redeemed": 0,
        "points_balance": 560
      }
    ]
  }
}
```

---

## Field reference (what each field maps to on our side)

### `sales` — required (this drives the cash reconciliation)

| Field | Type | Meaning / maps to |
|-------|------|-------------------|
| `z_report_total` | number | End-of-day Z-report total → our **Z-out total** |
| `gross_sales` | number | Total before refunds/discounts (optional) |
| `net_sales` | number | Total after refunds/discounts (optional) |
| `refunds` | number | Total refunds (optional) |
| `discounts` | number | Total discounts (optional) |
| `by_payment_method.cash` | number | Cash portion of sales |
| `by_payment_method.visa` | number | Card/Visa portion → our **Visa** |
| `by_payment_method.transfer_cliq` | number | Bank transfer / CliQ → our **CliQ** |
| `by_payment_method.card_wallet` | number | Paid from wristband/card balance (optional) |
| `by_category[]` | array | Per-category sales; we read **Toys, Birthdays, Subscriptions** from here |
| `unpaid_debt` | number | Sales not yet paid (Ajel / ذمم), if tracked |

> The category names we look for are `Toys`, `Birthdays`, `Subscriptions`. Anything else
> is grouped as "other". If your system uses different names, just tell us the exact strings.

### `cards` — for card/wristband reporting

| Field | Type | Meaning |
|-------|------|---------|
| `activations_count` | number | How many cards/wristbands activated that day |
| `total_topup_amount` | number | Total money loaded onto cards |
| `total_outstanding_balance` | number | Unredeemed balance still on all cards (liability) |
| `activations[]` | array | Per-card activation (optional detail) |
| `topups[]` | array | Per-topup detail (optional) |

### `loyalty` — for loyalty points

| Field | Type | Meaning |
|-------|------|---------|
| `points_earned` | number | Points earned that day |
| `points_redeemed` | number | Points redeemed that day |
| `points_balance_total` | number | Total outstanding points across all members |
| `members[]` | array | Per-member breakdown (optional; omit if privacy-restricted) |

---

## Minimum viable version

If a full report is too much to start, the **`sales` block alone** is enough for us to
go live with automatic cash reconciliation. `cards` and `loyalty` can be added later.

## Notes

- Please keep field **names and nesting exactly as above** so no mapping work is needed.
- If a value doesn't exist, send `0` (numbers) or `[]` (arrays) — do not omit the key.
- Send `null` only for genuinely unknown optional fields.
- A `date` range endpoint (`from`/`to`) would be a bonus for backfilling history, but the
  single-date endpoint is what we need first.
