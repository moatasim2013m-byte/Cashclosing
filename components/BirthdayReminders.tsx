import React, { useState } from "react";
import {
  Cake,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Send,
  MessageCircle,
  Copy,
  Gift,
} from "lucide-react";
import { UpcomingBirthday } from "../types";

type UpcomingResponse = {
  ok: boolean;
  error?: string;
  days?: number;
  count?: number;
  auto_send_available?: boolean;
  upcoming?: UpcomingBirthday[];
};

export default function BirthdayReminders() {
  const [days, setDays] = useState(15);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [autoSendAvailable, setAutoSendAvailable] = useState(false);
  const [kids, setKids] = useState<UpcomingBirthday[]>([]);

  const checkBirthdays = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/birthdays/upcoming?days=${days}`);
      const result: UpcomingResponse = await res.json();
      if (!res.ok || !result.ok) {
        throw new Error(result.error || "Failed to load birthdays");
      }
      setKids(result.upcoming || []);
      setAutoSendAvailable(!!result.auto_send_available);
      setChecked(true);
    } catch (err: any) {
      setError(err?.message || "Failed to load birthdays");
    } finally {
      setLoading(false);
    }
  };

  const sendAll = async () => {
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/birthdays/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) {
        throw new Error(result.error || "Send failed");
      }
      setSuccess(
        `Sent ${result.sent} wish${result.sent === 1 ? "" : "es"} via WhatsApp` +
          (result.failed ? `, ${result.failed} failed` : "") +
          (result.skipped ? ` (${result.skipped} skipped — already wished or no phone)` : "")
      );
      await checkBirthdays();
    } catch (err: any) {
      setError(err?.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const copyMessage = async (message: string) => {
    try {
      await navigator.clipboard.writeText(message);
      setSuccess("Message copied!");
    } catch {
      setError("Could not copy message");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Cake className="text-pink-500" size={24} /> Birthday Reminders
          </h2>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Within</label>
            <input
              type="number"
              min={1}
              max={60}
              value={days}
              onChange={(e) => setDays(Math.min(60, Math.max(1, Number(e.target.value) || 15)))}
              className="w-16 px-2 py-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-pink-400 outline-none text-center"
            />
            <span className="text-sm text-gray-500">days</span>
            <button
              onClick={checkBirthdays}
              disabled={loading}
              className="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? <RefreshCw size={18} className="animate-spin" /> : <Gift size={18} />}
              Check Birthdays
            </button>
          </div>
        </div>

        {(error || success) && (
          <div
            className={`mb-4 p-4 rounded-lg flex items-center gap-3 ${
              error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
            }`}
          >
            {error ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
            <span>{error || success}</span>
          </div>
        )}

        {checked && kids.length === 0 && !error && (
          <p className="text-gray-500 text-center py-6">
            No birthdays in the next {days} days. 🎈
          </p>
        )}

        {kids.length > 0 && (
          <div className="space-y-4">
            {autoSendAvailable && (
              <button
                onClick={sendAll}
                disabled={sending}
                className="w-full px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center justify-center gap-2 font-bold disabled:opacity-50"
              >
                {sending ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
                Send all wishes via WhatsApp Business
              </button>
            )}

            {kids.map((kid) => (
              <div
                key={`${kid.row}-${kid.kid_name}`}
                className={`p-4 rounded-xl border-l-4 ${
                  kid.days_until <= 3
                    ? "border-red-400 bg-red-50"
                    : "border-pink-400 bg-pink-50"
                }`}
              >
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div>
                    <div className="font-bold text-gray-800 flex items-center gap-2">
                      🎂 {kid.kid_name}
                      {kid.already_wished && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          Already wished ✓
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      {kid.days_until === 0
                        ? "Birthday is TODAY!"
                        : `Birthday in ${kid.days_until} day${kid.days_until === 1 ? "" : "s"} (${kid.next_birthday})`}
                      {kid.turns_age ? ` — turning ${kid.turns_age}` : ""}
                      {kid.parent_name ? ` · Parent: ${kid.parent_name}` : ""}
                      {kid.phone ? ` · 📱 ${kid.phone}` : " · ⚠️ no phone number"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyMessage(kid.message)}
                      className="px-3 py-2 bg-white border rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-1 text-sm"
                    >
                      <Copy size={16} /> Copy
                    </button>
                    {kid.whatsapp_link && (
                      <a
                        href={kid.whatsapp_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center gap-1 text-sm"
                      >
                        <MessageCircle size={16} /> WhatsApp
                      </a>
                    )}
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="text-sm text-gray-500 cursor-pointer">
                    Preview message
                  </summary>
                  <pre className="mt-2 p-3 bg-white rounded-lg text-sm whitespace-pre-wrap font-sans text-gray-700 border">
                    {kid.message}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
