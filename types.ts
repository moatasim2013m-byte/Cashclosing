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
  schools: number;
  other_extra: number;

  unpaid_debt: number;
  expenses_total: number;
  non_cash_expenses: number;
  counted: number;
}

export interface UpcomingBirthday {
  row: number;
  kid_name: string;
  parent_name: string;
  phone: string;
  birthday: string;
  next_birthday: string | null;
  days_until: number;
  turns_age: number | null;
  already_wished: boolean;
  message: string;
  whatsapp_link: string | null;
}