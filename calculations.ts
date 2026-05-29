import { DailyClosingData } from "./types";

export function calculateTotals(data: Partial<DailyClosingData>) {
  const n = (val: any) => Number(val) || 0;

  // 1. Extras (cash & non-cash income except Z-report)
  // other_extra already includes:
  // - owner deposits (زيادة)
  // - Tarjee if income
  const extras =
    n(data.toys_extra) +
    n(data.birthdays) +
    n(data.subscriptions) +
    n(data.other_extra);

  // 2. Z-report sales
  const zOut = n(data.z_out_total);

  // 3. Unpaid debts (Ajel / ذمم)
  // These are NOT cash → subtract once from sales
  const debts = n(data.unpaid_debt);

  // 4. TOTAL SALES (matches backend)
  // zOut + extras - debts
  const totalSales = zOut + extras - debts;

  // 5. Non-cash payments
  const visa = n(data.visa);
  const cliq = n(data.transfer_cliq);

  // 6. Expected cash coming from sales
  // (what SHOULD be in the drawer from sales only)
  const expectedCashFromSales = totalSales - visa - cliq;

  // 7. Opening cash
  const opening = n(data.opening_cash);

  // 8. Cash expenses
  const expenses = n(data.expenses_total);

  // 9. Owner withdrawal (سحب)
  const ownerWithdrawal = n(data.owner_withdrawal);

  // 10. Expected closing cash (drawer)
  const expectedCash =
    opening + expectedCashFromSales - expenses - ownerWithdrawal;

  // 11. Actual counted cash
  const counted = n(data.counted);

  // 12. Difference (short / over)
  const diff = counted - expectedCash;

  return {
    totalSales,
    expectedCash,
    diff,
  };
}
