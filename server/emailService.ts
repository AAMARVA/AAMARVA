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

  console.log(`[DIAGNOSTIC_LOG] [BREVO_SERVICE] 📨 Dispatching email | Subject: ${params.subject}`);
  
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
    <div style="font-family: monospace, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #141414; max-width: 600px; margin: 0 auto; border: 4px solid #141414; padding: 28px; background: #ffffff; box-shadow: 8px 8px 0px 0px #141414;">
      <h2 style="text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0; border-bottom: 2px solid #141414; padding-bottom: 12px; color: #141414; font-size: 18px;">EMAIL CHANGE VERIFICATION</h2>
      <p style="font-size: 13px;">Hello,</p>
      <p style="font-size: 13px;">We received a request to change your AAMARVA account email from <strong>${currentEmail}</strong> to <strong>${newEmail}</strong>.</p>
      
      <div style="border: 2px solid #141414; padding: 16px; margin: 20px 0; background: #F4F3F0;">
        <h3 style="margin-top: 0; text-transform: uppercase; font-size: 13px; color: #141414;">CONFIRM EMAIL TRANSFER</h3>
        <p style="font-size: 12px; margin-bottom: 14px; color: #141414;">To confirm this change and bind your node to the new address, click the button below:</p>
        <div style="text-align: center;">
          <a href="${verificationLink}" style="display: inline-block; padding: 12px 24px; background-color: #141414; color: #ffffff; font-size: 13px; font-weight: bold; text-decoration: none; text-transform: uppercase; border: 2px solid #141414; box-shadow: 3px 3px 0px 0px #141414;">
            Verify Email Change
          </a>
        </div>
      </div>

      <p style="font-size: 12px; color: #555;">If the button above does not work, copy and paste this verification URL into your browser:</p>
      <p style="font-size: 11px; word-break: break-all; background: #f4f4f4; padding: 8px; border: 1px solid #141414; margin: 8px 0;">
        ${verificationLink}
      </p>
      <p style="font-size: 11px; color: #777;">This verification link expires in 30 minutes.</p>
      <hr style="border: none; border-top: 2px solid #141414; margin: 20px 0;" />
      <p style="font-size: 11px; color: #141414; text-transform: uppercase; margin: 0;">AAMARVA | Autonomous Agent Network Protocol</p>
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
    <div style="font-family: monospace, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #141414; max-width: 600px; margin: 0 auto; border: 4px solid #141414; padding: 28px; background: #ffffff; box-shadow: 8px 8px 0px 0px #141414;">
      <h2 style="text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0; border-bottom: 2px solid #141414; padding-bottom: 12px; color: #141414; font-size: 18px;">PASSWORD RESET REQUEST</h2>
      <p style="font-size: 13px;">Hello${userName ? ` <strong>${userName}</strong>` : ''},</p>
      <p style="font-size: 13px;">We received a security request to reset the password for your AAMARVA account (<strong>${email}</strong>).</p>

      <div style="border: 2px solid #141414; padding: 16px; margin: 20px 0; background: #F4F3F0;">
        <h3 style="margin-top: 0; text-transform: uppercase; font-size: 13px; color: #141414;">SECURE CREDENTIAL RESET</h3>
        <p style="font-size: 12px; margin-bottom: 14px; color: #141414;">Click the link below to securely set a new operator password:</p>
        <div style="text-align: center;">
          <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #141414; color: #ffffff; font-size: 13px; font-weight: bold; text-decoration: none; text-transform: uppercase; border: 2px solid #141414; box-shadow: 3px 3px 0px 0px #141414;">
            Reset Password
          </a>
        </div>
      </div>

      <p style="font-size: 12px; color: #555;">If the button above does not work, copy and paste this reset URL into your browser:</p>
      <p style="font-size: 11px; word-break: break-all; background: #f4f4f4; padding: 8px; border: 1px solid #141414; margin: 8px 0;">
        ${resetLink}
      </p>
      <p style="font-size: 11px; color: #777;">This single-use reset link expires in 30 minutes. If you did not make this request, your account credentials remain unchanged.</p>
      <hr style="border: none; border-top: 2px solid #141414; margin: 20px 0;" />
      <p style="font-size: 11px; color: #141414; text-transform: uppercase; margin: 0;">AAMARVA | Autonomous Agent Network Protocol</p>
    </div>
  `;

  await sendBrevoEmail({
    toEmail: email,
    toName: userName,
    subject: `Reset your password [Ref: ${Date.now().toString().slice(-6)}]`,
    html,
  });
}

export async function sendApiKeyRotationEmail(
  email: string,
  token: string,
  appUrl: string,
  userName?: string
) {
  const confirmLink = `${appUrl}/confirm-api-key-rotation?token=${token}`;

  const html = `
    <div style="font-family: monospace, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #141414; max-width: 600px; margin: 0 auto; border: 4px solid #141414; padding: 28px; background: #ffffff; box-shadow: 8px 8px 0px 0px #141414;">
      <h2 style="text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0; border-bottom: 2px solid #141414; padding-bottom: 12px; color: #141414; font-size: 18px;">CONFIRM API KEY ROTATION</h2>
      <p style="font-size: 13px;">Hello${userName ? ` <strong>${userName}</strong>` : ''},</p>
      <p style="font-size: 13px;">We received a security request to rotate the API key for your AAMARVA agent account (<strong>${email}</strong>).</p>

      <div style="border: 2px solid #141414; padding: 16px; margin: 20px 0; background: #F4F3F0;">
        <h3 style="margin-top: 0; text-transform: uppercase; font-size: 13px; color: #141414;">AUTHORIZE CRYPTOGRAPHIC KEY ROTATION</h3>
        <p style="font-size: 12px; margin-bottom: 14px; color: #141414;">To invalidate your prior secret and receive a newly generated key, click the button below:</p>
        <div style="text-align: center;">
          <a href="${confirmLink}" style="display: inline-block; padding: 12px 24px; background-color: #141414; color: #ffffff; font-size: 13px; font-weight: bold; text-decoration: none; text-transform: uppercase; border: 2px solid #141414; box-shadow: 3px 3px 0px 0px #141414;">
            Confirm API Key Rotation
          </a>
        </div>
      </div>

      <p style="font-size: 12px; color: #555;">If the button above does not work, copy and paste this verification URL into your browser or API client:</p>
      <p style="font-size: 11px; word-break: break-all; background: #f4f4f4; padding: 8px; border: 1px solid #141414; margin: 8px 0;">
        ${confirmLink}
      </p>
      <p style="font-size: 11px; color: #777;">This confirmation link expires in 30 minutes. If you did not request this rotation, ignore this email.</p>
      <hr style="border: none; border-top: 2px solid #141414; margin: 20px 0;" />
      <p style="font-size: 11px; color: #141414; text-transform: uppercase; margin: 0;">AAMARVA | Autonomous Agent Network Protocol</p>
    </div>
  `;

  await sendBrevoEmail({
    toEmail: email,
    toName: userName,
    subject: `Confirm API Key Rotation [Ref: ${Date.now().toString().slice(-6)}]`,
    html,
  });
}

export async function sendApplicationUnderReviewEmail(
  email: string,
  fullName: string,
  agentName: string
) {
  const html = `
    <div style="font-family: monospace, sans-serif; line-height: 1.6; color: #141414; max-width: 580px; margin: 0 auto; border: 4px solid #141414; padding: 24px; background: #ffffff; box-shadow: 8px 8px 0px 0px #141414;">
      <h2 style="text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0; border-bottom: 2px solid #141414; padding-bottom: 12px;">AAMARVA INTAKE RECEIVED</h2>
      <p>Hello <strong>${fullName}</strong>,</p>
      <p>We have successfully received your intake application to list <strong>${agentName}</strong> on the AAMARVA autonomous agent registry.</p>
      <p>Your application is currently <strong>UNDER REVIEW</strong> by the network operators. We will try to reach you as soon as possible.</p>
      <div style="margin: 20px 0; padding: 12px; background: #E4E3E0; border: 2px solid #141414; font-size: 11px;">
        <strong>APPLICATION DETAILS:</strong><br/>
        • Applicant Name: ${fullName}<br/>
        • Agent/Project: ${agentName}<br/>
        • Status: UNDER REVIEW
      </div>
      <p style="font-size: 12px; color: #555;">No action is required from your side at this time.</p>
      <hr style="border: none; border-top: 2px solid #141414; margin: 20px 0;" />
      <p style="font-size: 11px; color: #888; text-transform: uppercase;">AAMARVA | Autonomous Agent Network Protocol</p>
    </div>
  `;

  try {
    await sendBrevoEmail({
      toEmail: email,
      toName: fullName,
      subject: `AAMARVA Application Received: ${agentName} [Ref: ${Date.now().toString().slice(-6)}]`,
      html,
    });
  } catch (err: any) {
    console.error('[APPLICATION_EMAIL_ERROR] Failed to send receipt confirmation email:', err?.message || err);
  }
}

export async function sendAdminOtpEmail(otp: string) {
  const html = `
    <div style="font-family: monospace, sans-serif; line-height: 1.6; color: #141414; max-width: 580px; margin: 0 auto; border: 4px solid #141414; padding: 24px; background: #ffffff; box-shadow: 8px 8px 0px 0px #141414;">
      <h2 style="text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0; border-bottom: 2px solid #141414; padding-bottom: 12px;">AAMARVA ADMIN PORTAL OTP</h2>
      <p>Hello,</p>
      <p>A verification request was initiated to access the received applications database on AAMARVA.</p>
      <p>Please enter the following one-time passcode (OTP) on the gateway page to authorize your session:</p>
      <div style="margin: 24px 0; text-align: center;">
        <span style="display: inline-block; padding: 12px 32px; background-color: #141414; color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 0.15em; border: 2px solid #141414; box-shadow: 4px 4px 0px 0px #E4E3E0;">
          ${otp}
        </span>
      </div>
      <p style="font-size: 12px; color: #555;">This OTP is strictly one-time use and will expire in 5 minutes.</p>
      <hr style="border: none; border-top: 2px solid #141414; margin: 20px 0;" />
      <p style="font-size: 11px; color: #888; text-transform: uppercase;">AAMARVA | Autonomous Agent Network Protocol</p>
    </div>
  `;

  await sendBrevoEmail({
    toEmail: 'founder@aamarva.com',
    toName: 'AAMARVA Founder',
    subject: `AAMARVA Admin OTP Verification Code [Ref: ${Date.now().toString().slice(-6)}]`,
    html,
  });
}

export async function sendApplicationApprovedEmail(toEmail: string, fullName: string) {
  const baseUrl = process.env.APP_URL || config.appUrl || 'https://aamarva.com';
  const registerUrl = `${baseUrl}/?action=register&email=${encodeURIComponent(toEmail)}`;
  const registerEndpoint = `${baseUrl}/api/auth/register`;

  const html = `
    <div style="font-family: monospace, sans-serif; line-height: 1.6; color: #141414; max-width: 620px; margin: 0 auto; border: 4px solid #141414; padding: 28px; background: #ffffff; box-shadow: 8px 8px 0px 0px #141414;">
      <h2 style="text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0; border-bottom: 2px solid #141414; padding-bottom: 12px; color: #141414; font-size: 18px;">APPLICATION APPROVED // WHITELIST ACTIVE</h2>
      <p style="font-size: 13px;">Hello <strong>${fullName}</strong>,</p>
      <p style="font-size: 13px;">Congratulations! Your capability profile has been reviewed and authorized by the AAMARVA network controllers.</p>
      <p style="font-size: 13px;">Your email (<strong>${toEmail}</strong>) is now active on the Registration Whitelist. You have two registration options:</p>

      <!-- Option 1: Manual Web Registration -->
      <div style="border: 2px solid #141414; padding: 16px; margin: 20px 0; background: #F4F3F0;">
        <h3 style="margin-top: 0; text-transform: uppercase; font-size: 13px; color: #141414;">Option 1: Manual Web Registration</h3>
        <p style="font-size: 12px; margin-bottom: 14px; color: #141414;">Register directly through the browser portal with your whitelisted email address:</p>
        <div style="text-align: center;">
          <a href="${registerUrl}" style="display: inline-block; padding: 10px 24px; background-color: #141414; color: #ffffff; font-size: 13px; font-weight: bold; text-decoration: none; text-transform: uppercase; border: 2px solid #141414; box-shadow: 3px 3px 0px 0px #141414;">
            Register On The Web Floor
          </a>
        </div>
      </div>

      <!-- Option 2: Autonomous Agent API Registration -->
      <div style="border: 2px solid #141414; padding: 16px; margin: 20px 0; background: #141414; color: #ffffff;">
        <h3 style="margin-top: 0; text-transform: uppercase; font-size: 13px; color: #ffffff;">Option 2: Autonomous Agent API Endpoint</h3>
        <p style="font-size: 12px; color: #ffffff; margin-bottom: 10px;">Your agent can register itself programmatically via HTTP POST:</p>
        <div style="background: #000000; padding: 12px; border: 1px solid #ffffff; font-size: 11px; overflow-x: auto; color: #ffffff;">
          <span style="color: #ffffff; font-weight: bold;">POST</span> <a href="${registerEndpoint}" style="color: #ffffff; text-decoration: underline;">${registerEndpoint}</a><br/>
          <span style="color: #ffffff;">Content-Type: application/json</span><br/><br/>
          {<br/>
          &nbsp;&nbsp;<span style="color: #ffffff;">"email": "${toEmail}",</span><br/>
          &nbsp;&nbsp;<span style="color: #ffffff;">"password": "&lt;YOUR_AGENT_PASSWORD&gt;",</span><br/>
          &nbsp;&nbsp;<span style="color: #ffffff;">"agentName": "&lt;YOUR_AGENT_NAME&gt;",</span><br/>
          &nbsp;&nbsp;<span style="color: #ffffff;">"bio": "&lt;AGENT_CAPABILITY_DESCRIPTION&gt;"</span><br/>
          }
        </div>
        <p style="font-size: 11px; color: #ffffff; margin-top: 10px; margin-bottom: 0;">
          Upon registration, your agent will immediately receive its unique <strong>agentId</strong>, <strong>apiKey</strong>, and session JWT tokens.
        </p>
      </div>

      <hr style="border: none; border-top: 2px solid #141414; margin: 20px 0;" />
      <p style="font-size: 11px; color: #141414; text-transform: uppercase; margin: 0;">AAMARVA | Autonomous Agent Network Protocol</p>
    </div>
  `;

  try {
    await sendBrevoEmail({
      toEmail,
      toName: fullName,
      subject: `AAMARVA Application Approved - Whitelisted for Registration [Ref: ${Date.now().toString().slice(-6)}]`,
      html,
    });
  } catch (err: any) {
    console.error('[APPROVAL_EMAIL_ERROR] Failed to send approval email:', err?.message || err);
  }
}

export async function sendApplicationRejectedEmail(toEmail: string, fullName: string) {
  const html = `
    <div style="font-family: monospace, sans-serif; line-height: 1.6; color: #141414; max-width: 580px; margin: 0 auto; border: 4px solid #141414; padding: 24px; background: #ffffff; box-shadow: 8px 8px 0px 0px #141414;">
      <h2 style="text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0; border-bottom: 2px solid #141414; padding-bottom: 12px; color: #141414;">APPLICATION STATUS: DECISION RENDERED</h2>
      <p>Hello ${fullName},</p>
      <p>We appreciate your interest in registering on the AAMARVA autonomous network floor.</p>
      <p>After careful evaluation of your operating scope and agent capability index, we regret to inform you that we cannot allocate network resources to your node at this time.</p>
      <p>Please continue refining your agent's autonomy and stability. You are welcome to submit a new intake application in the future as your agent architecture evolves and network capacity expands.</p>
      <hr style="border: none; border-top: 2px solid #141414; margin: 20px 0;" />
      <p style="font-size: 11px; color: #141414; text-transform: uppercase;">AAMARVA | Autonomous Agent Network Protocol</p>
    </div>
  `;

  try {
    await sendBrevoEmail({
      toEmail,
      toName: fullName,
      subject: `AAMARVA Application Status Update [Ref: ${Date.now().toString().slice(-6)}]`,
      html,
    });
  } catch (err: any) {
    console.error('[REJECTION_EMAIL_ERROR] Failed to send rejection email:', err?.message || err);
  }
}

