const crypto = require("crypto");
const Passenger = require("../models/passenger");
const AppError = require("../utils/appError");

// Helper for HTTP/HTTPS requests
const fetchJson = async (url, options = {}) => {
  const res = await fetch(url, options);
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch (e) {
    return { ok: res.ok, status: res.status, data: text };
  }
};

/**
 * 1. Initiate Google OAuth 2.0 / OpenID Connect Flow
 * Endpoint: GET /auth/google
 */
const googleAuthInit = (req, res, next) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(503).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google OAuth Configuration Required</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 40px; background: #f9f9f9; color: #333; }
            .card { background: white; border-radius: 8px; max-width: 600px; margin: 0 auto; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            h2 { color: #d9534f; }
            code { background: #eee; padding: 2px 6px; border-radius: 4px; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Google OAuth Setup Required</h2>
            <p>Google OAuth credentials are not yet configured in <code>Backend/.env</code>.</p>
            <p>Please configure <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to enable Google Sign-In.</p>
            <p><a href="http://localhost:5173/login">&larr; Return to GoBus Login</a></p>
          </div>
        </body>
      </html>
    `);
  }

  const callbackUrl =
    process.env.GOOGLE_CALLBACK_URL ||
    "http://localhost:5000/auth/google/callback";

  // Generate cryptographically secure state token to protect against CSRF
  const state = crypto.randomBytes(32).toString("hex");

  // Store state in HttpOnly cookie (expires in 10 minutes)
  res.cookie("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
  });

  // Construct Google OIDC Authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "openid email profile",
    state: state,
    prompt: "select_account",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return res.redirect(authUrl);
};

/**
 * 2. Handle Google OAuth 2.0 Callback
 * Endpoint: GET /auth/google/callback
 */
const googleAuthCallback = async (req, res, next) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const { code, state, error: oauthError } = req.query;
  const storedState = req.cookies ? req.cookies.oauth_state : null;

  // Clear state cookie
  res.clearCookie("oauth_state");

  if (oauthError) {
    return res.redirect(
      `${frontendUrl}/login?oauth=error&message=${encodeURIComponent(
        "User cancelled or Google OAuth error: " + oauthError
      )}`
    );
  }

  if (!state || !storedState || state !== storedState) {
    return res.redirect(
      `${frontendUrl}/login?oauth=error&message=${encodeURIComponent(
        "Invalid OAuth state parameter. Possible CSRF attack."
      )}`
    );
  }

  if (!code) {
    return res.redirect(
      `${frontendUrl}/login?oauth=error&message=${encodeURIComponent(
        "No authorization code returned from Google."
      )}`
    );
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackUrl =
      process.env.GOOGLE_CALLBACK_URL ||
      "http://localhost:5000/auth/google/callback";

    // Exchange authorization code for tokens
    const tokenRes = await fetchJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok || !tokenRes.data.access_token) {
      console.error("Google token exchange error:", tokenRes.data);
      return res.redirect(
        `${frontendUrl}/login?oauth=error&message=${encodeURIComponent(
          "Failed to exchange authorization code for Google tokens."
        )}`
      );
    }

    const accessToken = tokenRes.data.access_token;

    // Fetch verified user profile from Google OIDC UserInfo endpoint
    const userRes = await fetchJson(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!userRes.ok || !userRes.data.email) {
      return res.redirect(
        `${frontendUrl}/login?oauth=error&message=${encodeURIComponent(
          "Failed to retrieve user profile from Google."
        )}`
      );
    }

    const { sub: googleId, email, name, email_verified } = userRes.data;

    if (email_verified === false) {
      return res.redirect(
        `${frontendUrl}/login?oauth=error&message=${encodeURIComponent(
          "Google email address is not verified."
        )}`
      );
    }

    // Check if user already exists by googleId or email
    let passenger = await Passenger.findOne({
      $or: [{ googleId: googleId }, { email: email.toLowerCase() }],
    });

    if (passenger) {
      // If user exists, ensure googleId and authProvider are linked
      if (!passenger.googleId) {
        passenger.googleId = googleId;
        if (!passenger.authProvider) {
          passenger.authProvider = "google";
        }
        await passenger.save();
      }
    } else {
      // Create new Passenger for Google user
      const derivedUsername =
        name || email.split("@")[0] || "User_" + googleId.substring(0, 6);
      passenger = new Passenger({
        username: derivedUsername,
        email: email.toLowerCase(),
        googleId: googleId,
        authProvider: "google",
        role: "Passenger",
      });

      await passenger.save();
    }

    // Generate GoBus JWT token
    const token = await passenger.generateAuthToken();

    const userPayload = {
      id: passenger._id,
      role: passenger.role || "Passenger",
      username: passenger.username,
      email: passenger.email,
      mobile: passenger.mobile || "",
      token: token,
    };

    // Set short-lived HttpOnly cookie for secure SPA session handoff
    res.cookie("gobus_oauth_temp", JSON.stringify(userPayload), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 5 * 60 * 1000,
    });

    return res.redirect(`${frontendUrl}/login?oauth=success`);
  } catch (error) {
    console.error("Google Auth Exception:", error);
    return res.redirect(
      `${frontendUrl}/login?oauth=error&message=${encodeURIComponent(
        "An unexpected error occurred during Google authentication."
      )}`
    );
  }
};

/**
 * 3. Retrieve OAuth Session Data (called by frontend upon oauth=success)
 * Endpoint: GET /auth/google/session
 */
const getGoogleOAuthSession = (req, res) => {
  const rawCookie = req.cookies ? req.cookies.gobus_oauth_temp : null;

  if (!rawCookie) {
    return res.status(401).send({
      code: 1,
      msg: "No active Google OAuth session found",
      data: null,
    });
  }

  try {
    const userPayload = JSON.parse(rawCookie);
    // Clear temporary handoff cookie
    res.clearCookie("gobus_oauth_temp");

    return res.status(200).send({
      code: 0,
      msg: "Google login successful",
      data: userPayload,
    });
  } catch (error) {
    res.clearCookie("gobus_oauth_temp");
    return res.status(400).send({
      code: 1,
      msg: "Invalid session payload",
      data: null,
    });
  }
};

module.exports = {
  googleAuthInit,
  googleAuthCallback,
  getGoogleOAuthSession,
};
