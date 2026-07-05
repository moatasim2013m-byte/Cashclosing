import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

/* ===================== CORS ===================== */
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      return allowedOrigins.includes(origin)
        ? cb(null, true)
        : cb(new Error("Not allowed by CORS"));
    },
  })
);

// Increase limit for image uploads
app.use(express.json({ limit: "50mb" }));

app.get("/health", (_req, res) => res.status(200).send("ok"));
app.use(express.static(path.join(__dirname, "dist")));

/* ===================== ENV ===================== */
const SHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || "Daily Closings";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-pro";

/* ===================== HELPERS ===================== */
const toNumber = (val) => {
  if (val === null || val === undefined || val === "") return 0;
  const clean = String(val).replace(/[$,\s]/g, "");
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
};

const normalizeISODate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function dataUrlToBase64AndMime(dataUrl) {
  let base64 = dataUrl;
  let mimeType = "image/jpeg";

  if (typeof dataUrl === "string" && dataUrl.includes("base64,")) {
    const parts = dataUrl.split("base64,");
    const header = parts[0];
    base64 = parts[1] || "";

    if (/png/i.test(header)) mimeType = "image/png";
    else if (/webp/i.test(header)) mimeType = "image/webp";
    else mimeType = "image/jpeg";
  }

  return { base64, mimeType };
}

/* ===================== GEMINI CONFIG ===================== */
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "");

/* ===================== ANALYZE API ===================== */
app.post("/api/analyze", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      console.error("Missing GEMINI_API_KEY");
      return res.status(500).json({ ok: false, error: "Server missing API Key" });
    }

    const body = req.body || {};
    const imageInput = body.image || body.imageDataUrl;

    if (!imageInput) {
      return res.status(400).json({ ok: false, error: "No image provided" });
    }

    const { base64, mimeType } = dataUrlToBase64AndMime(imageInput);
    if (!base64 || base64.length < 100) {
      return res.status(400).json({ ok: false, error: "Invalid image data" });
    }

    // 1. Setup Model
    const model = genAI.getGenerativeModel({ 
        model: GEMINI_MODEL,
        generationConfig: { responseMimeType: "application/json" },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
    });

    // 2. Prompt (FIXED VISA LOGIC & AGGRESSIVE TOY SEARCH)
    const promptText = `
You are an expert accountant. Analyze this handwritten daily closing sheet with these PRIORITY rules.

### 1. TOYS & GAMES (Aggressive Search)
* **Look for:** Any small numbers (1, 2, 3, 5...) next to ANY word that looks like a toy, game, or item.
* **Keywords:** "Toy", "Game", "لعبة", "العاب", "Stitch", "Pop", "Slime", "Socks", "Mask", "Sword", "Spinner", "Balloon", "Cards", "لعبين".
* **Action:** Sum ALL of these into 'toys_extra'.
* **Note:** Even if scribbled, if it looks like an item sold separate from the Z-report, classify as Toy.

### 2. OPENING CASH (Highest Priority)
* **Rule:** Look at the Top-Left list. The first number is **Opening Cash**.
* **Conflict Fix:** If the text says "فتح كاش زيادة" (Opening Cash Ziyada), **IGNORE** the word "Ziyada". Treat it strictly as **'opening_cash'**.

### 3. EXTRAS (Ziyada)
* **Rule:** Look for other numbers labeled "زيادة" (Ziyada) or "+" that are NOT toys.
* **Action:** Sum these into 'other_extra'.
* **Exclusion:** Do NOT include the Opening Cash or Toys in this sum.

### 4. DEBT (Negative Constraint)
* **Rule:** "Ziyada" (زيادة) is NEVER Debt. Do not put any number labeled "زيادة" into 'unpaid_debt'.
* **Debt:** Only use 'unpaid_debt' if explicitly labeled "ذمم", "آجل", or "Not paid".

### 5. SALES vs VISA (Conflict Fix)
* **Z-Report (Sales):** The LARGEST number labeled "Z-out", "X-out", or "Total".
* **Visa:** The smaller number labeled "Visa".
* **CRITICAL:** If a number is crossed out, IGNORE IT. If there are two numbers for Visa, pick the **larger/cleaner** one (e.g., if 115 is crossed out and 144 is written, pick 144).

Return a STRICT JSON object:
{
  "detected_date": "YYYY-MM-DD",
  "opening_cash": number,
  "z_out_total": number,
  "visa": number,
  "transfer_cliq": number,
  "owner_withdrawal": number,
  "toys_extra": number,
  "birthdays": number,
  "subscriptions": number,
  "other_extra": number,
  "unpaid_debt": number,
  "expenses_total": number,
  "non_cash_expenses": number,
  "counted": number
}
    `.trim();

    // 3. Call Gemini
    const result = await model.generateContent([
      promptText,
      {
        inlineData: {
          data: base64,
          mimeType: mimeType
        }
      }
    ]);

    const response = await result.response;
    let rawText = response.text();
    console.log("GEMINI_RAW_RESPONSE:", rawText.slice(0, 100) + "...");

    const cleanedText = rawText.replace(/```json|```/gi, "").trim();
    
    let parsed;
    try {
      parsed = JSON.parse(cleanedText);
    } catch (e) {
      console.error("JSON Parse Failed:", e);
      return res.status(200).json({ ok: true, parsed: false, raw: rawText });
    }

    const iso = normalizeISODate(parsed.detected_date);
    parsed.detected_date = iso || null;

    const numericKeys = [
      "opening_cash", "z_out_total", "visa", "transfer_cliq",
      "owner_withdrawal", "toys_extra", "birthdays", "subscriptions",
      "other_extra", "unpaid_debt", "expenses_total", "non_cash_expenses",
      "counted"
    ];

    for (const k of numericKeys) {
      parsed[k] = toNumber(parsed[k]);
    }

    return res.json({ ok: true, parsed: true, data: parsed });

  } catch (err) {
    console.error("ANALYZE_ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message || "Analyze failed" });
  }
});

/* ===================== SMART SAVE API ===================== */
app.post("/api/save", async (req, res) => {
  try {
    if (!SHEET_ID) return res.status(500).json({ error: "Missing SPREADSHEET_ID" });

    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const d = req.body || {};
    const dateISO = normalizeISODate(d.date);
    if (!dateISO) return res.status(400).json({ error: "Invalid date" });

    const shift = (d.shift || "Night").trim();
    const open = toNumber(d.opening_cash);
    const zOut = toNumber(d.z_out_total);
    const toys = toNumber(d.toys_extra);
    const bday = toNumber(d.birthdays);
    const subs = toNumber(d.subscriptions);
    const other = toNumber(d.other_extra);
    const expenses = toNumber(d.expenses_total); 
    const visa = toNumber(d.visa);
    const cliq = toNumber(d.transfer_cliq);
    const counted = toNumber(d.counted);
    const ownerWithdrawal = toNumber(d.owner_withdrawal);
    const debts = toNumber(d.unpaid_debt);
    
    // CALCULATION LOGIC
    const totalSalesAll = zOut + toys + subs + bday + other;
    const expectedFromSales = totalSalesAll - visa - cliq - debts;
    const expectedClosing = open + expectedFromSales - expenses - ownerWithdrawal;
    const difference = counted - expectedClosing;

    const dateObj = new Date(`${dateISO}T00:00:00`);
    const weekday = dateObj.toLocaleDateString("en-US", { weekday: "long" });

    const row = [
      shift, dateISO, weekday, open, zOut, toys, subs, bday, other, 
      debts > 0 ? -debts : 0, totalSalesAll, ownerWithdrawal, expenses,cliq , visa, 
      expectedFromSales, expectedClosing, counted, difference,
    ];

    const getRows = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:B`,
    });

    const rowsAB = getRows.data.values || [];
    let rowIndex = -1;

    for (let i = 0; i < rowsAB.length; i++) {
      const r = rowsAB[i] || [];
      const shiftCell = (r[0] || "").trim();
      const dateCellISO = normalizeISODate(r[1]);

      if (shiftCell === shift && dateCellISO === dateISO) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A${rowIndex}:S${rowIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [row] },
      });
      return res.json({ success: true, mode: "updated", rowIndex });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A:S`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [row] },
      });
      return res.json({ success: true, mode: "appended" });
    }
  } catch (err) {
    console.error("SAVE_ERROR:", err);
    return res.status(500).json({ error: err?.message || "Save failed" });
  }
});

/* ===================== BIRTHDAY REMINDERS ===================== */
// Data source: a "Birthdays" tab (kid name, birth date, parent name, phone).
// Column headers are matched flexibly in English or Arabic.
const BIRTHDAYS_SHEET_ID = process.env.BIRTHDAYS_SPREADSHEET_ID || SHEET_ID;
const BIRTHDAYS_SHEET_NAME = process.env.BIRTHDAYS_SHEET_NAME || "Birthdays";
const BIRTHDAY_REMINDER_DAYS = Number(process.env.BIRTHDAY_REMINDER_DAYS) || 15;
const BIRTHDAY_DISCOUNT = process.env.BIRTHDAY_DISCOUNT || "20%";
const BOOKING_PHONE = process.env.BOOKING_PHONE || "0777775652";
const DEFAULT_COUNTRY_CODE = process.env.DEFAULT_COUNTRY_CODE || "962";
// Optional: a Make/Zapier webhook that delivers messages via WhatsApp Business.
const WHATSAPP_WEBHOOK_URL = process.env.WHATSAPP_WEBHOOK_URL || "";

const HEADER_KEYWORDS = {
  kidName: ["kid", "child", "اسم الطفل", "الطفل"],
  birthDate: ["birth", "dob", "ميلاد"],
  parentName: ["parent", "mother", "father", "guardian", "ولي", "الأم", "الأب"],
  phone: ["phone", "mobile", "whatsapp", "رقم", "هاتف", "موبايل", "جوال", "واتس"],
  lastWished: ["last wished", "wished", "تم التهنئة", "تهنئة"],
};

function findColumn(headers, keywords) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || "").toLowerCase().trim();
    if (h && keywords.some((k) => h.includes(k))) return i;
  }
  return -1;
}

// Accepts ISO, "October 5, 2020", and slashed dates (DD/MM/YYYY assumed when ambiguous).
function parseBirthDate(value) {
  if (!value) return null;
  const s = String(value).trim();

  const slashed = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (slashed) {
    let [, a, b, y] = slashed;
    a = Number(a);
    b = Number(b);
    y = Number(y.length === 2 ? "20" + y : y);
    let day = a, month = b;
    if (a > 12 && b <= 12) { day = a; month = b; }
    else if (b > 12 && a <= 12) { day = b; month = a; }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year: y, month, day };
  }

  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return { year: dt.getFullYear(), month: dt.getMonth() + 1, day: dt.getDate() };
}

// Next occurrence of month/day on or after `from` (Feb 29 celebrated Feb 28 in non-leap years).
function nextBirthday(month, day, from) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (const year of [start.getFullYear(), start.getFullYear() + 1]) {
    let d = day;
    if (month === 2 && day === 29) {
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      if (!isLeap) d = 28;
    }
    const candidate = new Date(year, month - 1, d);
    if (candidate >= start) return candidate;
  }
  return null;
}

function normalizePhone(raw) {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = DEFAULT_COUNTRY_CODE + digits.slice(1);
  // Bare local numbers like 79xxxxxxx (no leading zero)
  if (digits.length === 9 && digits.startsWith("7")) digits = DEFAULT_COUNTRY_CODE + digits;
  return digits;
}

function buildWishMessage({ kidName, parentName, turnsAge, daysUntil }) {
  const greeting = parentName ? `Hello ${parentName}! ` : "";
  const when = daysUntil === 0 ? "TODAY" : `in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
  const age = turnsAge ? ` — turning ${turnsAge}` : "";
  const whenAr = daysUntil === 0 ? "اليوم" : `بعد ${daysUntil} ${daysUntil === 1 ? "يوم" : "أيام"}`;
  const ageAr = turnsAge ? ` ورح يتم ${turnsAge} 🥳` : "";

  return (
    `🎂🎉 ${greeting}${kidName}'s birthday is ${when}${age}! ` +
    `Happy birthday from the whole Peekaboo family! 💙\n` +
    `Because ${kidName} is a Peekaboo kid, celebrate with us and enjoy a special ${BIRTHDAY_DISCOUNT} discount on any birthday party package! 🎈🎁\n` +
    `📞 Book now: ${BOOKING_PHONE}\n\n` +
    `🎂 كل عام و${kidName} بألف خير! عيد ميلاده ${whenAr}${ageAr} 🎉\n` +
    `ولأنه من أبناء بيكابو، بنقدملكم خصم خاص ${BIRTHDAY_DISCOUNT} على باقات حفلات أعياد الميلاد عنا! 🎈🎁\n` +
    `📞 للحجز: ${BOOKING_PHONE}`
  );
}

async function loadUpcomingBirthdays(days) {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: BIRTHDAYS_SHEET_ID,
    range: `${BIRTHDAYS_SHEET_NAME}!A:Z`,
  });

  const rows = resp.data.values || [];
  if (rows.length < 2) return { upcoming: [], lastWishedCol: -1 };

  const headers = rows[0];
  const col = {
    kidName: findColumn(headers, HEADER_KEYWORDS.kidName),
    birthDate: findColumn(headers, HEADER_KEYWORDS.birthDate),
    parentName: findColumn(headers, HEADER_KEYWORDS.parentName),
    phone: findColumn(headers, HEADER_KEYWORDS.phone),
    lastWished: findColumn(headers, HEADER_KEYWORDS.lastWished),
  };
  // Fall back to a generic "name" header for the kid column (avoid parent column).
  if (col.kidName === -1) {
    col.kidName = headers.findIndex(
      (h, i) => i !== col.parentName && /name|اسم/i.test(String(h || ""))
    );
  }
  if (col.kidName === -1 || col.birthDate === -1) {
    throw new Error(
      `Sheet "${BIRTHDAYS_SHEET_NAME}" must have a kid-name column and a birth-date column. Found headers: ${headers.join(", ")}`
    );
  }

  const today = new Date();
  const upcoming = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const kidName = String(r[col.kidName] || "").trim();
    const birth = parseBirthDate(r[col.birthDate]);
    if (!kidName || !birth) continue;

    const next = nextBirthday(birth.month, birth.day, today);
    if (!next) continue;

    const daysUntil = Math.round(
      (next - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000
    );
    if (daysUntil > days) continue;

    const parentName = col.parentName !== -1 ? String(r[col.parentName] || "").trim() : "";
    const phone = col.phone !== -1 ? normalizePhone(r[col.phone]) : "";
    const turnsAge = birth.year > 1900 ? next.getFullYear() - birth.year : null;
    const lastWishedRaw = col.lastWished !== -1 ? String(r[col.lastWished] || "").trim() : "";
    const lastWishedDate = lastWishedRaw ? new Date(lastWishedRaw) : null;
    // Already wished for this upcoming birthday if the last wish is within the past year window.
    const alreadyWished = !!(
      lastWishedDate &&
      !Number.isNaN(lastWishedDate.getTime()) &&
      (next - lastWishedDate) / 86400000 <= 365 - 30 &&
      lastWishedDate <= today
    );

    const message = buildWishMessage({ kidName, parentName, turnsAge, daysUntil });

    upcoming.push({
      row: i + 1,
      kid_name: kidName,
      parent_name: parentName,
      phone,
      birthday: `${birth.year > 1900 ? birth.year : "????"}-${String(birth.month).padStart(2, "0")}-${String(birth.day).padStart(2, "0")}`,
      next_birthday: normalizeISODate(next),
      days_until: daysUntil,
      turns_age: turnsAge,
      already_wished: alreadyWished,
      message,
      whatsapp_link: phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
        : null,
    });
  }

  upcoming.sort((a, b) => a.days_until - b.days_until);
  return { upcoming, lastWishedCol: col.lastWished, sheets };
}

// GET /api/birthdays/upcoming?days=15 → kids with a birthday within the window
app.get("/api/birthdays/upcoming", async (req, res) => {
  try {
    if (!BIRTHDAYS_SHEET_ID) {
      return res.status(500).json({ ok: false, error: "Missing SPREADSHEET_ID / BIRTHDAYS_SPREADSHEET_ID" });
    }
    const days = Math.min(60, Math.max(1, Number(req.query.days) || BIRTHDAY_REMINDER_DAYS));
    const { upcoming } = await loadUpcomingBirthdays(days);
    return res.json({
      ok: true,
      days,
      count: upcoming.length,
      auto_send_available: !!WHATSAPP_WEBHOOK_URL,
      upcoming,
    });
  } catch (err) {
    console.error("BIRTHDAYS_ERROR:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Failed to load birthdays" });
  }
});

// POST /api/birthdays/send { days?, rows?: number[] }
// Sends each wish through WHATSAPP_WEBHOOK_URL (e.g. a Make scenario that posts
// to WhatsApp Business) and stamps the "Last Wished" column when present.
app.post("/api/birthdays/send", async (req, res) => {
  try {
    if (!WHATSAPP_WEBHOOK_URL) {
      return res.status(400).json({
        ok: false,
        error: "WHATSAPP_WEBHOOK_URL is not configured. Use the per-kid WhatsApp links instead.",
      });
    }
    const days = Math.min(60, Math.max(1, Number(req.body?.days) || BIRTHDAY_REMINDER_DAYS));
    const onlyRows = Array.isArray(req.body?.rows) ? req.body.rows.map(Number) : null;

    const { upcoming, lastWishedCol, sheets } = await loadUpcomingBirthdays(days);
    const targets = upcoming.filter(
      (k) => k.phone && !k.already_wished && (!onlyRows || onlyRows.includes(k.row))
    );

    const results = [];
    for (const kid of targets) {
      try {
        const resp = await fetch(WHATSAPP_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: kid.phone,
            message: kid.message,
            kid_name: kid.kid_name,
            parent_name: kid.parent_name,
            birthday: kid.birthday,
            next_birthday: kid.next_birthday,
            days_until: kid.days_until,
            turns_age: kid.turns_age,
            discount: BIRTHDAY_DISCOUNT,
          }),
        });
        if (!resp.ok) throw new Error(`Webhook responded ${resp.status}`);

        if (lastWishedCol !== -1) {
          const colLetter = String.fromCharCode(65 + lastWishedCol);
          await sheets.spreadsheets.values.update({
            spreadsheetId: BIRTHDAYS_SHEET_ID,
            range: `${BIRTHDAYS_SHEET_NAME}!${colLetter}${kid.row}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [[normalizeISODate(new Date())]] },
          });
        }
        results.push({ kid_name: kid.kid_name, phone: kid.phone, sent: true });
      } catch (e) {
        results.push({ kid_name: kid.kid_name, phone: kid.phone, sent: false, error: e.message });
      }
    }

    const sent = results.filter((r) => r.sent).length;
    return res.json({
      ok: true,
      sent,
      failed: results.length - sent,
      skipped: upcoming.length - targets.length,
      results,
    });
  } catch (err) {
    console.error("BIRTHDAYS_SEND_ERROR:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Send failed" });
  }
});

/* ===================== SPA FALLBACK ===================== */
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});