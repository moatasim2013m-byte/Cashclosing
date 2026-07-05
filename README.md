<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1i13-NEbLCkFO6w_OdZAdbt44yTKnQpu9

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## 🎂 Birthday Reminders (on demand)

The app can check, on demand, which Peekaboo kids have a birthday coming up
(default: within 15 days) and prepare a WhatsApp wish with a special
discounted birthday-party offer.

### 1. Data source — the "Birthdays" sheet

Add a tab named **`Birthdays`** to your spreadsheet (the same one used for
Daily Closings, or a separate one). Headers are matched flexibly in English
or Arabic:

| Kid Name | Birth Date | Parent Name | Phone | Last Wished |
|----------|-----------|-------------|-------|-------------|
| Hamza    | 2019-07-10 | أمل شموط   | 0796488088 | |

- **Kid Name** (required) — also matches `Child`, `اسم الطفل`
- **Birth Date** (required) — `YYYY-MM-DD` recommended; `DD/MM/YYYY` also works — also matches `DOB`, `تاريخ الميلاد`
- **Parent Name** (optional) — also matches `Mother`, `ولي الأمر`
- **Phone** (optional but needed for WhatsApp) — local `07…` numbers are converted to international format automatically — also matches `Mobile`, `WhatsApp`, `رقم الهاتف`
- **Last Wished** (optional) — stamped automatically after auto-send so nobody gets the wish twice for the same birthday

### 2. Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `BIRTHDAYS_SPREADSHEET_ID` | `SPREADSHEET_ID` | Spreadsheet holding the Birthdays tab |
| `BIRTHDAYS_SHEET_NAME` | `Birthdays` | Tab name |
| `BIRTHDAY_REMINDER_DAYS` | `15` | Default look-ahead window |
| `BIRTHDAY_DISCOUNT` | `20%` | Discount shown in the wish message |
| `BOOKING_PHONE` | `0777775652` | Booking number in the message |
| `DEFAULT_COUNTRY_CODE` | `962` | Used to normalize local phone numbers |
| `WHATSAPP_WEBHOOK_URL` | *(empty)* | Optional Make/Zapier webhook that delivers messages via WhatsApp Business; enables the "Send all" button |

### 3. Using it

Open the app and press **Check Birthdays** in the Birthday Reminders panel:

- Each kid with a birthday in the window is listed with a ready bilingual
  (Arabic + English) wish message including the party discount.
- **WhatsApp** opens WhatsApp with the message pre-filled for that parent.
- **Copy** copies the message for any other channel.
- If `WHATSAPP_WEBHOOK_URL` is configured, **Send all wishes via WhatsApp
  Business** sends everything automatically and stamps `Last Wished`.

API endpoints: `GET /api/birthdays/upcoming?days=15` and
`POST /api/birthdays/send`.
