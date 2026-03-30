import { google } from "googleapis";

const PACKAGE_NAME = "app.clearahead.basic";
const PRODUCT_ID = "basic_unlock";

function getServiceAccountFromEnv() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  }
  return JSON.parse(raw);
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

async function getPublisherClient() {
  const serviceAccount = getServiceAccountFromEnv();

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });

  return google.androidpublisher({
    version: "v3",
    auth,
  });
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const purchaseToken = body.purchaseToken;
    const productId = body.productId;

    if (!purchaseToken) {
      return json(400, { ok: false, error: "Missing purchaseToken" });
    }

    if (productId !== PRODUCT_ID) {
      return json(400, { ok: false, error: "Invalid productId" });
    }

    const publisher = await getPublisherClient();

    const purchaseRes = await publisher.purchases.products.get({
      packageName: PACKAGE_NAME,
      productId: PRODUCT_ID,
      token: purchaseToken,
    });

    const purchase = purchaseRes.data || {};

    if (purchase.purchaseState !== 0) {
      return json(200, {
        ok: false,
        entitled: false,
        acknowledged: !!purchase.acknowledgementState,
        purchaseState: purchase.purchaseState,
        message: "Purchase is not completed",
      });
    }

    if (purchase.acknowledgementState !== 1) {
      await publisher.purchases.products.acknowledge({
        packageName: PACKAGE_NAME,
        productId: PRODUCT_ID,
        token: purchaseToken,
        requestBody: {},
      });
    }

    const verifyAgain = await publisher.purchases.products.get({
      packageName: PACKAGE_NAME,
      productId: PRODUCT_ID,
      token: purchaseToken,
    });

    const verified = verifyAgain.data || {};

    const entitled =
      verified.purchaseState === 0 && verified.acknowledgementState === 1;

    return json(200, {
      ok: true,
      entitled,
      acknowledged: verified.acknowledgementState === 1,
      purchaseState: verified.purchaseState,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error?.message || "Unknown server error",
    });
  }
}