import nodemailer from 'nodemailer';

let transporter;

const getHttpsMailConfig = () => {
  if (!process.env.RESEND_API_KEY) return null;
  return {
    endpoint: process.env.RESEND_API_URL || 'https://api.resend.com/emails',
    apiKey: process.env.RESEND_API_KEY,
  };
};

function getTransporter() {
  if (transporter !== undefined) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    transporter = null;
    return null;
  }
  const port = Number(SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

async function sendViaHttps({ to, subject, text, html }) {
  const config = getHttpsMailConfig();
  if (!config) return null;

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'Brightloop <no-reply@brightloop.com>',
      to: [to],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`HTTPS email provider returned ${response.status}: ${detail.slice(0, 200)}`);
  }

  return { provider: 'https' };
}

export async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (t) {
    try {
      return await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
    } catch (smtpError) {
      if (getHttpsMailConfig()) return sendViaHttps({ to, subject, text, html });
      if (process.env.NODE_ENV === 'production') throw smtpError;
    }
  }

  if (getHttpsMailConfig()) return sendViaHttps({ to, subject, text, html });
  if (process.env.NODE_ENV === 'production') throw new Error('SMTP and HTTPS email providers are not configured');
  console.log(`\n[mail not configured, printing instead]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
  return { skipped: true };
}
