import { config } from './config';

/**
 * Helper to parse an email string like "AAMARVA <no-reply@aamarva.com>" or "no-reply@aamarva.com"
 * into a structured Brevo sender/replyTo object: { name?: string, email: string }.
 */
function parseEmailString(formatted: string, defaultName?: string): { name?: string; email: string } {
  if (!formatted) return { name: defaultName, email: '' };
  const match = formatted.match(/^(?:"?([^"]*)"?\s+)?<([^>]+)>$/);
  if (match) {
    const name = match[1]?.trim() || defaultName;
    const email = match[2]?.trim();
    return name ? { name, email } : { email };
  }
  const email = formatted.trim();
  return defaultName ? { name: defaultName, email } : { email };
}

function getBrevoConfig(): { apiKey: string; from: string; replyTo: string } {
  const apiKey = process.env.BREVO_API_KEY || config.brevoApiKey;
  const from = process.env.EMAIL_FROM || config.emailFrom || 'AAMARVA <no-reply@aamarva.com>';
  const replyTo = process.env.EMAIL_REPLY_TO || config.emailReplyTo || 'AAMARVA Support <support@aamarva.com>';

  if (!apiKey || !apiKey.trim()) {
    console.error('[DIAGNOSTIC_LOG] [BREVO_SERVICE] ❌ CANNOT SEND EMAIL: BREVO_API_KEY environment variable is not configured.');
    throw new Error('BREVO_API_KEY environment variable is not configured.');
  }

  return {
    apiKey: apiKey.trim(),
    from: from.trim(),
    replyTo: replyTo.trim(),
  };
}

/**
 * Generic internal function to dispatch an email via Brevo V3 Transactional API
 */
async function sendBrevoEmail(params: {
  toEmail: string;
  toName?: string;
  subject: string;
  html: string;
}): Promise<{ messageId?: string }> {
  const { apiKey, from, replyTo } = getBrevoConfig();

  const senderObj = parseEmailString(from, 'AAMARVA');
  const replyToObj = parseEmailString(replyTo, 'AAMARVA Support');
  const recipientObj: { email: string; name?: string } = { email: params.toEmail };
  if (params.toName?.trim()) {
    recipientObj.name = params.toName.trim();
  }

  const payload = {
    sender: senderObj,
    to: [recipientObj],
    replyTo: replyToObj,
    subject: params.subject,
    htmlContent: params.html,
    textContent: params.html ? params.html.replace(/<[^>]*>?/gm, '') : '',
  };

  console.log(`[DIAGNOSTIC_LOG] [BREVO_SERVICE] 📨 Dispatching email to ${params.toEmail} | Subject: ${params.subject}`);
  
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorDetails = '';
    try {
      const errJson = await response.json();
      errorDetails = JSON.stringify(errJson);
    } catch {
      errorDetails = await response.text();
    }
    console.error(`[DIAGNOSTIC_LOG] [BREVO_SERVICE] ❌ Brevo API call failed with HTTP ${response.status}:`, errorDetails);
    throw new Error(`Brevo API call failed (HTTP ${response.status}): ${errorDetails}`);
  }

  const data = await response.json().catch(() => ({})) as { messageId?: string };
  return data;
}

export async function sendEmailVerification(
  currentEmail: string,
  newEmail: string,
  token: string,
  appUrl: string
) {
  const verificationLink = `${appUrl}/verify-email-change?token=${token}`;

  const html = `
    <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
      <h2>Email Change Verification</h2>
      <p>Hello,</p>
      <p>We received a request to change your AAMARVA account email from <strong>${currentEmail}</strong> to <strong>${newEmail}</strong>.</p>
      <p>To confirm this change, please click the link below:</p>
      <p>
        <a href="${verificationLink}" style="display: inline-block; padding: 10px 20px; background-color: #141414; color: #ffffff; text-decoration: none; border-radius: 4px;">Verify Email Change</a>
      </p>
      <p>If the button doesn't work, copy and paste this link: <br /> ${verificationLink}</p>
      <p>This link expires in 30 minutes.</p>
      <hr />
      <p style="font-size: 12px; color: #777;">AAMARVA | Secure Autonomous Agent Registry</p>
    </div>
  `;

  await sendBrevoEmail({
    toEmail: currentEmail,
    subject: `Confirm your email change [Ref: ${Date.now().toString().slice(-6)}]`,
    html,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  rawToken: string,
  appUrl: string,
  userName?: string
) {
  const resetLink = `${appUrl}/reset-password?token=${rawToken}`;

  const html = `
    <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
      <h2>Password Reset Request</h2>
      <p>Hello${userName ? ` ${userName}` : ''},</p>
      <p>We received a request to reset your password for AAMARVA (<strong>${email}</strong>).</p>
      <p>To set a new password, please click the link below:</p>
      <p>
        <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #141414; color: #ffffff; text-decoration: none; border-radius: 4px;">Reset Password</a>
      </p>
      <p>If the button doesn't work, copy and paste this link: <br /> ${resetLink}</p>
      <p>This link expires in 30 minutes.</p>
      <hr />
      <p style="font-size: 12px; color: #777;">AAMARVA | Secure Autonomous Agent Registry</p>
    </div>
  `;

  await sendBrevoEmail({
    toEmail: email,
    toName: userName,
    subject: `Reset your password [Ref: ${Date.now().toString().slice(-6)}]`,
    html,
  });
}
