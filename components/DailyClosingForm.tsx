import React, { useState, useRef, useMemo } from "react";
import {
  Camera,
  Upload,
  Save,
  Calculator,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
// REMOVED: import { calculateTotals } from "../calculations";
// We do the math locally now to ensure Owner Withdrawal is included without editing extra files.
import { DailyClosingData } from "../types";

type AnalyzeSuccessParsed = {
  ok: true;
  parsed: true;
  data: Partial<DailyClosingData>;
};

type AnalyzeSuccessUnparsed = {
  ok: true;
  parsed: false;
  raw: string;
};

type AnalyzeFail = {
  ok: false;
  error?: string;
};

type AnalyzeResponse = AnalyzeSuccessParsed | AnalyzeSuccessUnparsed | AnalyzeFail;

export default function DailyClosingForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [aiRaw, setAiRaw] = useState<string | null>(null);

  // Initialize strictly with the Types
  const [formData, setFormData] = useState<DailyClosingData>({
    opening_cash: 0,
    z_out_total: 0,
    visa: 0,
    transfer_cliq: 0,
    owner_withdrawal: 0, // ✅ New Field
    toys_extra: 0,
    birthdays: 0,
    subscriptions: 0,
    other_extra: 0,
    unpaid_debt: 0,
    expenses_total: 0,
    non_cash_expenses: 0,
    counted: 0,
    shift: "Night",
    date: new Date().toISOString().split("T")[0],
  });

  // ✅ INTERNAL MATH (Updated to subtract Owner Withdrawal)
  const { totalSales, expectedCash, diff } = useMemo(() => {
    // 1. Total Income
    const totalSales =
      formData.z_out_total +
      formData.toys_extra +
      formData.birthdays +
      formData.subscriptions +
      formData.other_extra;

    // 2. Cash Expected in Drawer (The Fix is here!)
    // Formula: (Opening + Sales) - (Visa + CliQ + Debts) - Expenses - OWNER WITHDRAWAL
    const expectedCash =
      formData.opening_cash +
      (totalSales - formData.visa - formData.transfer_cliq - formData.unpaid_debt) -
      formData.expenses_total -
      formData.owner_withdrawal; // <--- ensuring this is subtracted!

    // 3. Difference
    const diff = formData.counted - expectedCash;

    return { totalSales, expectedCash, diff };
  }, [formData]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccess(null);
    setAiRaw(null);
    setLoading(true);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      setImagePreview(base64String);

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: base64String }),
        });

        const result: AnalyzeResponse = await res.json();

        // backend error (non-200 or ok:false)
        if (!res.ok || result.ok === false) {
          throw new Error(("error" in result && result.error) ? result.error : "Analysis failed");
        }

        // if Gemini returned unstructured text
        if (result.parsed === false) {
          setAiRaw(result.raw || "");
          setSuccess("Image analyzed, but the AI response was not structured. Please enter values manually.");
          return;
        }

        // ✅ parsed === true here
        const ai: any = result.data ?? {};
        const mapped: any = {
          detected_date: ai.detected_date ?? ai.date,
          opening_cash: ai.opening_cash,
          z_out_total: ai.z_out_total ?? ai.z_report ?? ai.z_report_sales ?? ai.z_report_sales,
          visa: ai.visa ?? ai.visa_sales,
          transfer_cliq: ai.transfer_cliq ?? ai.cliq_transfer ?? ai.cliq_transfers,
          owner_withdrawal: ai.owner_withdrawal ?? ai.owner_withdrawals, // ✅ Capture from AI
          toys_extra: ai.toys_extra,
          birthdays: ai.birthdays ?? ai.birthdays_extra,
          subscriptions: ai.subscriptions ?? ai.subscriptions_extra,
          other_extra: ai.other_extra ?? ai.other_extra_income,
          unpaid_debt: ai.unpaid_debt,
          expenses_total: ai.expenses_total,
          non_cash_expenses: ai.non_cash_expenses,
          counted: ai.counted ?? ai.counted_cash ?? ai.counted_cash_total,
        };

        const safeDate =
          typeof ai.detected_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ai.detected_date)
            ? ai.detected_date
            : formData.date;

        setFormData((prev) => ({
          ...prev,
          date: safeDate,
          opening_cash: Number(mapped.opening_cash) || 0,
          z_out_total: Number(mapped.z_out_total) || 0,
          visa: Number(mapped.visa) || 0,
          transfer_cliq: Number(mapped.transfer_cliq) || 0,
          owner_withdrawal: Number(mapped.owner_withdrawal) || 0,
          toys_extra: Number(mapped.toys_extra) || 0,
          birthdays: Number(mapped.birthdays) || 0,
          subscriptions: Number(mapped.subscriptions) || 0,
          other_extra: Number(mapped.other_extra) || 0,
          unpaid_debt: Number(mapped.unpaid_debt) || 0,
          expenses_total: Number(mapped.expenses_total) || 0,
          non_cash_expenses: Number(mapped.non_cash_expenses) || 0,
          counted: Number(mapped.counted) || 0,
        }));

        setSuccess("Image analyzed! Date and numbers updated.");
      } catch (err: any) {
        setError(err?.message || "Analysis failed");
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result?.success) {
        throw new Error(result?.error || "Save failed");
      }

      setSuccess(
        result?.mode === "updated"
          ? `Saved (updated row ${result?.rowIndex || ""}).`
          : "Saved successfully to Google Sheets!"
      );
    } catch (err: any) {
      setError("Save failed: " + (err?.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "shift" || name === "date" ? value : parseFloat(value) || 0,
    }));
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <BackButton />

      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Peekaboo Closing</h1>
          <div className="flex gap-2">
            <select
              name="shift"
              value={formData.shift}
              onChange={handleChange}
              className="px-3 py-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="Morning">Morning</option>
              <option value="Afternoon">Afternoon</option>
              <option value="Night">Night</option>
            </select>

            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              className="px-3 py-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-blue-200 rounded-xl p-8 text-center cursor-pointer hover:bg-blue-50 transition-colors"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />

          {loading ? (
            <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
          ) : imagePreview ? (
            <img
              src={imagePreview}
              alt="Preview"
              className="max-h-64 mx-auto rounded-lg shadow-sm"
            />
          ) : (
            <div className="space-y-2">
              <Camera className="w-12 h-12 text-blue-400 mx-auto" />
              <p className="text-gray-500">Tap to upload sheet</p>
            </div>
          )}
        </div>

        {(error || success) && (
          <div
            className={`mt-4 p-4 rounded-lg flex items-center gap-3 ${
              error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
            }`}
          >
            {error ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
            <span>{error || success}</span>
          </div>
        )}

        {aiRaw && (
          <div className="mt-4 p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-900">
            <div className="font-bold mb-2">AI Output (not structured)</div>
            <pre className="whitespace-pre-wrap text-sm font-mono">{aiRaw}</pre>
            <div className="text-xs mt-2 text-yellow-700">
              Tip: If this keeps happening, we can tighten the prompt or switch
              the model.
            </div>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
            <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
              <Upload size={18} /> Income
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <InputGroup
                label="Opening Cash"
                name="opening_cash"
                value={formData.opening_cash}
                onChange={handleChange}
              />
              <InputGroup
                label="Z-Report (Sales)"
                name="z_out_total"
                value={formData.z_out_total}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-yellow-500">
            <h3 className="font-bold text-gray-700 mb-4">Extras</h3>
            <div className="grid grid-cols-2 gap-4">
              <InputGroup
                label="Toys"
                name="toys_extra"
                value={formData.toys_extra}
                onChange={handleChange}
              />
              <InputGroup
                label="Birthdays"
                name="birthdays"
                value={formData.birthdays}
                onChange={handleChange}
              />
              <InputGroup
                label="Subs"
                name="subscriptions"
                value={formData.subscriptions}
                onChange={handleChange}
              />
              <InputGroup
                label="Other"
                name="other_extra"
                value={formData.other_extra}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500">
            <h3 className="font-bold text-gray-700 mb-4">Deductions</h3>
            <div className="grid grid-cols-2 gap-4">
              <InputGroup
                label="Visa"
                name="visa"
                value={formData.visa}
                onChange={handleChange}
              />
              <InputGroup
                label="CliQ"
                name="transfer_cliq"
                value={formData.transfer_cliq}
                onChange={handleChange}
              />
              <InputGroup
                label="Expenses"
                name="expenses_total"
                value={formData.expenses_total}
                onChange={handleChange}
              />
              <InputGroup
                label="Debts (Unpaid)"
                name="unpaid_debt"
                value={formData.unpaid_debt}
                onChange={handleChange}
                color="text-red-600"
              />
            </div>
            <div className="mt-4">
              <InputGroup
                label="Owner Withdrawal (سحب)"
                name="owner_withdrawal"
                value={formData.owner_withdrawal}
                onChange={handleChange}
                color="bg-red-50 text-red-900"
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
            <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
              <Calculator size={18} /> Cash Reconciliation
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between text-gray-600">
                <span>Total Sales:</span>
                <span className="font-mono font-bold">
                  {totalSales.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Expected Cash:</span>
                <span className="font-mono font-bold">
                  {expectedCash.toFixed(2)}
                </span>
              </div>

              <InputGroup
                label="ACTUAL COUNTED CASH"
                name="counted"
                value={formData.counted}
                onChange={handleChange}
                size="text-xl"
              />

              <div
                className={`flex justify-between items-center p-3 rounded-lg ${
                  diff === 0
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                <span className="font-bold">Difference:</span>
                <span className="font-mono font-bold text-lg">
                  {diff > 0 ? "+" : ""}
                  {diff.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={loading}
        className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-3"
      >
        <Save size={24} />
        {loading ? "Saving..." : "Confirm & Save"}
      </button>
    </div>
  );
}

/**
 * Premium, polished "Back" button.
 * Returns the user to the previous screen (e.g. the Peekaboo staff panel).
 * Falls back to the site root when there is no browser history to go back to.
 */
const BackButton = ({ label = "Back" }: { label?: string }) => {
  const handleBack = () => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "/";
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="Go back to the previous page"
      className="group inline-flex items-center gap-2 rounded-full border border-gray-200/80 bg-white/80 px-4 py-2.5 font-semibold text-gray-700 shadow-sm ring-1 ring-black/5 backdrop-blur-sm transition-all duration-200 hover:-translate-x-0.5 hover:border-blue-300 hover:text-blue-700 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-95"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm transition-transform duration-200 group-hover:-translate-x-0.5">
        <ArrowLeft size={15} strokeWidth={2.5} />
      </span>
      <span>{label}</span>
    </button>
  );
};

const InputGroup = ({
  label,
  name,
  value,
  onChange,
  color = "",
  size = "text-lg",
}: any) => (
  <div className="space-y-1">
    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
      {label}
    </label>
    <input
      type="number"
      step="0.01"
      name={name}
      value={value}
      onChange={onChange}
      className={`w-full p-2 border border-gray-300 rounded-lg font-mono font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none ${color} ${size}`}
      onFocus={(e) => e.target.select()}
    />
  </div>
);
