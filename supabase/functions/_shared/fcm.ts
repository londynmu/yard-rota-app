/**
 * FCM HTTP v1 helpers for Edge Functions.
 * Secret: FIREBASE_SERVICE_ACCOUNT = full service-account JSON string.
 */

export type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type FcmSendResult =
  | { ok: true; name?: string }
  | { ok: false; status: number; error: string; unregistered?: boolean };

let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

export function loadFirebaseServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT") || "";
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      return null;
    }
    return {
      ...parsed,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binary.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function fetchAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAtMs > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;

  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json() as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error || `OAuth token exchange failed (${res.status})`);
  }
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  cachedAccessToken = {
    token: json.access_token,
    expiresAtMs: Date.now() + expiresIn * 1000,
  };
  return json.access_token;
}

export async function sendFcmMessage(params: {
  sa: ServiceAccount;
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<FcmSendResult> {
  const accessToken = await fetchAccessToken(params.sa);
  const url =
    `https://fcm.googleapis.com/v1/projects/${params.sa.project_id}/messages:send`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: params.token,
        notification: {
          title: params.title,
          body: params.body,
        },
        data: params.data ?? {},
        android: {
          priority: "HIGH",
          notification: {
            channelId: "yard_rota_breaks",
          },
        },
      },
    }),
  });

  const text = await res.text();
  let parsed: { name?: string; error?: { status?: string; message?: string } } =
    {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }

  if (res.ok) {
    return { ok: true, name: parsed.name };
  }

  const statusName = parsed.error?.status || "";
  const unregistered =
    res.status === 404 ||
    statusName === "NOT_FOUND" ||
    statusName === "UNREGISTERED" ||
    /UNREGISTERED|Requested entity was not found/i.test(text);

  return {
    ok: false,
    status: res.status,
    error: parsed.error?.message || text.slice(0, 500) || `HTTP ${res.status}`,
    unregistered,
  };
}
