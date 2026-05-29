export interface DailyClosingData {
  shift: string;
  date: string;

  // returned by analyze (optional)
  detected_date?: string;

  opening_cash: number;
  z_out_total: number;
  visa: number;
  transfer_cliq: number;
  
  // ✅ NEW: Added specifically for Column L
  owner_withdrawal: number;

  toys_extra: number;
  birthdays: number;
  subscriptions: number;
  other_extra: number;

  unpaid_debt: number;
  expenses_total: number;
  non_cash_expenses: number;
  counted: number;
}