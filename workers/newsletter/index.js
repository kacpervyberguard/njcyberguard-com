// NJ CyberGuard — Daily Newsletter Worker
// Runs daily at 9 AM ET via cron trigger
// Calls Grok API to generate content, then sends via Resend

export default {
  // Cron trigger handler
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendNewsletter(env));
  },

  // HTTP handler — POST /trigger for manual sends, GET / for health check
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/trigger') {
      ctx.waitUntil(sendNewsletter(env));
      return new Response(JSON.stringify({ ok: true, message: 'Newsletter send triggered' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('NJ CyberGuard Newsletter Worker is running.', { status: 200 });
  }
};

// ─── Main orchestrator ────────────────────────────────────────────────────────

async function sendNewsletter(env) {
  console.log('Newsletter job started');

  const [content, subscribers] = await Promise.all([
    generateContent(env.GROK_API_KEY),
    getSubscribers(env.RESEND_API_KEY)
  ]);

  if (!subscribers.length) {
    console.log('No active subscribers — skipping send');
    return;
  }

  await sendEmails(env.RESEND_API_KEY, content, subscribers);
  console.log(`Newsletter delivered to ${subscribers.length} subscribers`);
}

// ─── Grok content generation ──────────────────────────────────────────────────

async function generateContent(apiKey) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York'
  });

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'grok-3-mini',
      messages: [
        {
          role: 'system',
          content: `You are a cybersecurity expert writing a concise daily briefing for small and medium businesses in New Jersey. Be professional but approachable. Focus on practical, immediately actionable advice. Today is ${today}.`
        },
        {
          role: 'user',
          content: `Write today's NJ CyberGuard Daily Security Briefing. Structure it with these three sections:

1. **Threat of the Day** — One current or trending cybersecurity threat businesses should be aware of right now
2. **Action Item** — One specific, practical security step they can take today (be concrete)
3. **NJ Business Corner** — A brief note relevant to NJ businesses (could be state regulations, local context, industry-specific tip for NJ's common business types like healthcare, finance, or manufacturing)

Format each section with an <h2> heading and <p> or <ul> body content. Keep total under 380 words. Start directly with the first heading — no preamble.`
        }
      ],
      max_tokens: 900,
      temperature: 0.7
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Grok API error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

// ─── Resend: fetch subscriber list ────────────────────────────────────────────

async function getSubscribers(resendApiKey) {
  // Get audience list
  const listRes = await fetch('https://api.resend.com/audiences', {
    headers: { 'Authorization': `Bearer ${resendApiKey}` }
  });
  const listData = await listRes.json();
  const audiences = listData.data || [];
  const audience = audiences.find(a => a.name === 'NJ Security Newsletter') || audiences[0];

  if (!audience) {
    console.log('No Resend audience found');
    return [];
  }

  // Get contacts
  const contactsRes = await fetch(`https://api.resend.com/audiences/${audience.id}/contacts`, {
    headers: { 'Authorization': `Bearer ${resendApiKey}` }
  });
  const contactsData = await contactsRes.json();
  const contacts = contactsData.data || [];

  // Only active subscribers
  return contacts.filter(c => !c.unsubscribed && c.email);
}

// ─── Resend: send emails ──────────────────────────────────────────────────────

async function sendEmails(resendApiKey, htmlContent, subscribers) {
  const today = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York'
  });

  const fullHtml = buildEmailHtml(htmlContent, today);
  const subject = `NJ Security Briefing — ${today}`;

  // Send in batches of 50 (Resend limit per call)
  const emails = subscribers.map(s => s.email);
  for (let i = 0; i < emails.length; i += 50) {
    const batch = emails.slice(i, i + 50);
    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'NJ CyberGuard <info@njcyberguard.com>',
        to: batch,
        subject,
        html: fullHtml
      })
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      console.error(`Resend error (batch ${i / 50 + 1}): ${err}`);
    } else {
      console.log(`Batch ${i / 50 + 1} sent (${batch.length} recipients)`);
    }
  }
}

// ─── Email HTML template ──────────────────────────────────────────────────────

function buildEmailHtml(content, dateStr) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NJ CyberGuard Daily Briefing</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',system-ui,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0d1b3e 0%,#1a3068 55%,#1a55af 100%);padding:36px 40px;">
      <div style="color:#bdd4ff;font-size:0.72rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:10px;">
        Daily Security Briefing
      </div>
      <div style="color:#fff;font-size:1.6rem;font-weight:800;line-height:1.2;">
        NJ CyberGuard
      </div>
      <div style="color:rgba(255,255,255,0.6);font-size:0.85rem;margin-top:8px;">
        ${dateStr}
      </div>
    </div>

    <!-- Body -->
    <div style="padding:36px 40px;color:#1a1a2e;line-height:1.75;font-size:0.97rem;">
      <style>
        h2 { color:#0d1b3e; font-size:1.05rem; font-weight:700; margin:28px 0 10px; padding-bottom:6px; border-bottom:2px solid #e2e8f0; }
        h2:first-child { margin-top:0; }
        p { margin:0 0 14px; color:#334155; }
        ul { margin:0 0 14px; padding-left:20px; color:#334155; }
        li { margin-bottom:6px; }
        strong { color:#0d1b3e; }
      </style>
      ${content}
    </div>

    <!-- CTA -->
    <div style="padding:0 40px 32px;text-align:center;">
      <a href="https://njcyberguard.com/#contact"
         style="display:inline-block;background:#1a55af;color:#fff;text-decoration:none;padding:13px 30px;border-radius:6px;font-weight:600;font-size:0.92rem;">
        Get a Free Security Assessment →
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:24px 40px;background:#f7f9ff;border-top:1px solid #e2e8f0;">
      <p style="color:#64748b;font-size:0.8rem;margin:0 0 6px;text-align:center;">
        You're receiving this because you subscribed at
        <a href="https://njcyberguard.com" style="color:#1a55af;text-decoration:none;">njcyberguard.com</a>
      </p>
      <p style="color:#94a3b8;font-size:0.75rem;margin:0;text-align:center;">
        Questions? Reply to this email or contact
        <a href="mailto:info@njcyberguard.com" style="color:#1a55af;text-decoration:none;">info@njcyberguard.com</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}
