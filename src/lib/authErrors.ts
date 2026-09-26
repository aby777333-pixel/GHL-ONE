/*
  Supabase Auth error text, said plainly.

  The sign-in, sign-up and reset forms showed `error.message` verbatim, so a person saw "email rate
  limit exceeded" (Supabase's built-in mailer refusing to send, nothing they did) or "Invalid login
  credentials" with no hint that "Forgot password?" is the way out. Each message here says what
  happened and what to do next. Anything unrecognised falls through unchanged — an honest raw
  message beats a wrong friendly one.
*/

export function authErrorMessage(raw: string | null | undefined, opts: { email?: string } = {}): string {
  const m = (raw || "").trim();
  const lower = m.toLowerCase();
  const who = opts.email ? ` to ${opts.email}` : "";

  if (lower.includes("rate limit") || lower.includes("over_email_send_rate_limit") || lower.includes("too many requests")) {
    return "Too many emails have gone out in the last hour, so this one could not be sent. It is a limit on the email service, not something you did — wait an hour and try again, or ask an owner to raise the limit.";
  }
  if (/only request this after (\d+) seconds/.test(lower)) {
    const secs = /after (\d+) seconds/.exec(lower)?.[1];
    return `Please wait ${secs ?? "a few"} seconds before asking for another email.`;
  }
  if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials")) {
    return "That email and password do not match. Check both, or use “Forgot password?” to choose a new password.";
  }
  if (lower.includes("email not confirmed")) {
    return `Your email is not confirmed yet. Open the confirmation link we sent${who}, then sign in. Nothing arrived? Check spam, or use “Forgot password?” — that link confirms the address too.`;
  }
  if (lower.includes("user already registered") || lower.includes("already been registered")) {
    return "This email already has an account. Sign in, or use “Forgot password?” to set a new password.";
  }
  if (lower.includes("otp_expired") || lower.includes("link is invalid or has expired") || lower.includes("token has expired") || lower.includes("one-time token not found")) {
    return "That link has expired or was already used. Request a new one and open it on this device within the hour.";
  }
  if (lower.includes("password should be") || lower.includes("weak_password") || lower.includes("password is known to be weak")) {
    return "Choose a stronger password: at least 8 characters, and not one that appears in known password leaks.";
  }
  if (lower.includes("same password") || lower.includes("different from the old password")) {
    return "That is the password you already have. Choose a different one.";
  }
  if (lower.includes("signups not allowed") || lower.includes("signup_disabled")) {
    return "New accounts are not being accepted right now. Ask an owner to invite you.";
  }
  if (lower.includes("email address") && lower.includes("not authorized")) {
    return "The email service refused this address. Ask an owner to check the email settings.";
  }
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("load failed")) {
    return "Could not reach the sign-in service. Check your connection and try again.";
  }
  if (lower.includes("unable to validate email") || lower.includes("invalid email")) {
    return "That does not look like a valid email address.";
  }
  return m || "Something went wrong. Please try again.";
}

/*
  Supabase can send a person back to the login page with the failure in the URL rather than in a
  response — an expired or already-used link arrives as `?error=access_denied&error_code=otp_expired
  &error_description=Email+link+is+invalid+or+has+expired`, either as a query string or, for implicit
  flows, in the hash. Read both so the page can say what happened instead of showing a blank form.
*/
export function authErrorFromUrl(search: URLSearchParams, hash?: string): string | null {
  const fromHash = hash && hash.startsWith("#") ? new URLSearchParams(hash.slice(1)) : null;
  const pick = (k: string) => search.get(k) || fromHash?.get(k) || null;
  const code = pick("error_code");
  const description = pick("error_description");
  const error = pick("error");
  if (!code && !description && !error) return null;
  return authErrorMessage(`${code ?? ""} ${description ?? error ?? ""}`);
}
