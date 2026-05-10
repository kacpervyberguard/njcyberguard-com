// subscribe.js — Cloudflare Pages Function
// Adds subscribers directly to the Resend audience list and sends a welcome email.

const AUDIENCE_ID = '18fcdedb-8008-4d8c-9df9-a0664d4cce29';
const FROM_EMAIL = 'NJ CyberGuard <newsletter@njcyberguard.com>';

function buildWelcomeEmail(firstName) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  return {
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to NJ CyberGuard</title>
</head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:'Segoe UI',Arial,sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f1e;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#0d1528;border:1px solid #1e3a5f;border-radius:8px;overflow:hidden;max-width:600px;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0a0f1e 0%,#0d2137 100%);padding:32px 40px;border-bottom:1px solid #1e3a5f;text-align:center;">
            <div style="font-size:26px;font-weight:700;color:#00d4ff;letter-spacing:1px;">🛡️ NJ CyberGuard</div>
            <div style="font-size:13px;color:#7fa8c9;margin-top:4px;letter-spacing:2px;">NETWORK &amp; SECURITY SOLUTIONS</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="font-size:16px;color:#e2e8f0;margin:0 0 16px;">${greeting}</p>
            <p style="font-size:16px;color:#e2e8f0;margin:0 0 16px;">
              You're now subscribed to the <strong style="color:#00d4ff;">NJ CyberGuard Daily Newsletter</strong> — your morning briefing on the latest cybersecurity threats, vulnerabilities, and news from around the web.
            </p>
            <p style="font-size:15px;color:#a0b8cc;margin:0 0 24px;">
              Every morning you'll receive a concise digest covering the most important security stories — curated and summarized so you can stay informed without spending hours reading.
            </p>

            <!-- What to expect box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a1628;border:1px solid #1e3a5f;border-radius:6px;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;">
                  <div style="font-size:13px;font-weight:700;color:#00d4ff;letter-spacing:1px;margin-bottom:12px;">WHAT TO EXPECT</div>
                  <div style="font-size:14px;color:#a0b8cc;line-height:1.7;">
                    ⚡ Daily threat intelligence &amp; breach alerts<br/>
                    🔍 Vulnerability disclosures &amp; patch advisories<br/>
                    📰 Top cybersecurity news headlines<br/>
                    💡 Practical security tips for businesses
                  </div>
                </td>
              </tr>
            </table>

            <p style="font-size:14px;color:#7fa8c9;margin:0 0 24px;">
              Your first edition will arrive tomorrow morning. In the meantime, feel free to visit <a href="https://njcyberguard.com" style="color:#00d4ff;text-decoration:none;">njcyberguard.com</a> to learn more about our services.
            </p>

            <p style="font-size:15px;color:#e2e8f0;margin:0;">
              Stay safe,<br/>
              <strong style="color:#00d4ff;">The NJ CyberGuard Team</strong>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#070c1a;padding:20px 40px;border-top:1px solid #1e3a5f;text-align:center;">
            <p style="font-size:12px;color:#4a6a85;margin:0;">
              You're receiving this because you subscribed at njcyberguard.com.<br/>
              To unsubscribe, reply with "unsubscribe" in the subject line.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    text: `${greeting}

You're now subscribed to the NJ CyberGuard Daily Newsletter — your morning briefing on the latest cybersecurity threats, vulnerabilities, and news.

Every morning you'll receive a concise digest covering the most important security stories.

What to expect:
- Daily threat intelligence & breach alerts
- Vulnerability disclosures & patch advisories
- Top cybersecurity news headlines
- Practical security tips for businesses

Your first edition will arrive tomorrow morning. Visit https://njcyberguard.com to learn more.

Stay safe,
The NJ CyberGuard Team

---
To unsubscribe, reply with "unsubscribe" in the subject line.`
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const { email, name } = await request.json();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400, headers
      });
    }

    const apiKey = env.RESEND_AUDIENCE_KEY || env.RESEND_API_KEY;
    const nameParts = (name || '').trim().split(' ');
    const firstName = nameParts[0] || '';
    const payload = { email, unsubscribed: false };
    if (firstName) payload.first_name = firstName;
    if (nameParts.length > 1) payload.last_name = nameParts.slice(1).join(' ');

    // 1. Add to audience
    const res = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Resend audience error:', detail);
      return new Response(JSON.stringify({ error: 'Subscription failed' }), {
        status: 500, headers
      });
    }

    // 2. Send welcome email (best-effort — don't fail the subscription if this errors)
    try {
      const { html, text } = buildWelcomeEmail(firstName);
      const sendKey = env.RESEND_API_KEY || apiKey;
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [email],
          subject: '👋 Welcome to the NJ CyberGuard Daily Newsletter',
          html,
          text
        })
      });
      if (!emailRes.ok) {
        console.error('Welcome email error:', await emailRes.text());
      }
    } catch (emailErr) {
      console.error('Welcome email exception:', emailErr);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers });

  } catch (err) {
    console.error('Subscribe handler error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
