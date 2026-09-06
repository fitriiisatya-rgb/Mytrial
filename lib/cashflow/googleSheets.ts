import { google } from "googleapis";

/**
 * Google Sheets access, server-side only, via a service account.
 * Credentials come exclusively from environment variables — never
 * hardcoded, never sent to the client. See .env.example for the two
 * variables this needs.
 */
function getServiceAccountAuth() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!clientEmail || !rawKey) {
    throw new Error(
      "Google Sheets sync is not configured: set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"
    );
  }
  // .env files can't hold real newlines in a private key — the standard
  // workaround is storing them as literal "\n" and unescaping here.
  const privateKey = rawKey.replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

/** Fetch every row of one sheet/tab, including the header row at index 0. Returns raw strings — no parsing/validation here, that belongs to the sync service. */
export async function fetchSheetRows(spreadsheetId: string, sheetName: string): Promise<string[][]> {
  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const values = res.data.values ?? [];
  // Normalize ragged rows (Sheets omits trailing empty cells) to strings.
  return values.map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))));
}

/** List every sheet/tab name in the spreadsheet — used by Settings to let Finance pick the right tab instead of hardcoding one. */
export async function listSheetTabs(spreadsheetId: string): Promise<string[]> {
  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return (res.data.sheets ?? []).map((s) => s.properties?.title).filter((t): t is string => Boolean(t));
}
