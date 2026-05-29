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

/* ===================== SPA FALLBACK ===================== */
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});