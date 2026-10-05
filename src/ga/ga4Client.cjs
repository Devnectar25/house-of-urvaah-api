// src/ga/ga4Client.cjs

const { BetaAnalyticsDataClient } = require("@google-analytics/data");
const path = require("path");
const fs = require("fs");

const propertyId = process.env.GA4_PROPERTY_ID;
const keyFilePath = process.env.GA4_KEY_FILE;
const credentialsJson = process.env.GA4_CREDENTIALS_JSON;
const clientEmail = process.env.GA4_CLIENT_EMAIL;
const privateKey = process.env.GA4_PRIVATE_KEY;

let ga4Client = null;

if (propertyId) {
  try {
    if (credentialsJson) {
      // 1. Direct JSON string from Vercel env var
      const credentials = typeof credentialsJson === 'string' ? JSON.parse(credentialsJson) : credentialsJson;
      ga4Client = new BetaAnalyticsDataClient({ credentials });
      console.log("✅ GA4 Client initialized via GA4_CREDENTIALS_JSON");
    } else if (clientEmail && privateKey) {
      // 2. Direct client_email and private_key from Vercel env vars
      const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
      ga4Client = new BetaAnalyticsDataClient({
        credentials: {
          client_email: clientEmail,
          private_key: formattedPrivateKey,
        },
      });
      console.log("✅ GA4 Client initialized via GA4_CLIENT_EMAIL and GA4_PRIVATE_KEY");
    } else if (keyFilePath) {
      // 3. Local key file fallback
      const resolvedPath = path.resolve(process.cwd(), keyFilePath);
      if (fs.existsSync(resolvedPath)) {
        ga4Client = new BetaAnalyticsDataClient({
          keyFilename: resolvedPath,
        });
        console.log("✅ GA4 Client initialized via local key file");
      } else {
        console.warn(`⚠️ GA4 Key file not found at ${resolvedPath}. GA4 features disabled.`);
      }
    } else {
      console.log("ℹ️ No GA4 credentials provided. GA4 features disabled.");
    }
  } catch (err) {
    console.error("❌ Failed to initialize GA4 Client:", err.message);
  }
} else {
  console.log("ℹ️ GA4_PROPERTY_ID missing. GA4 features are disabled.");
}

module.exports = {
  ga4Client,
  propertyId,
};
