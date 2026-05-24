const crypto = require("crypto");

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function getPrivateKey() {
  return (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}

function isSheetsConfigured() {
  return Boolean(
    process.env.GOOGLE_SHEETS_ENABLED === "true" &&
      process.env.GOOGLE_SHEET_ID &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY
  );
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      exp: now + 3600,
      iat: now,
    })
  );
  const unsignedToken = `${header}.${claim}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsignedToken)
    .sign(getPrivateKey(), "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsignedToken}.${signature}`,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Google token request failed");
  }
  return data.access_token;
}

async function appendListingToSheet(room) {
  if (!isSheetsConfigured()) return;

  const accessToken = await getAccessToken();
  const sheetName = process.env.GOOGLE_SHEET_TAB || "Listings";
  const range = encodeURIComponent(`${sheetName}!A:Q`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const values = [
    [
      new Date().toISOString(),
      room._id.toString(),
      room.title,
      room.ownerName || "",
      room.ownerContact,
      room.ownerAddress || "",
      room.area,
      room.landmark,
      room.rent,
      room.deposit,
      room.roomType,
      room.category,
      room.food,
      room.availability,
      room.published ? "Yes" : "No",
      room.videoUrl || "",
      room.description || "",
    ],
  ];

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Sheets append failed: ${errorText}`);
  }
}

module.exports = { appendListingToSheet, isSheetsConfigured };
