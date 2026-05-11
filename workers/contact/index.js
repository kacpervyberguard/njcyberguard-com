// NJ CyberGuard — Quote / Contact Form Worker
// Accepts POST from build-your-system.html and index.html contact forms.
// Sends a notification email to info@njcyberguard.com via Resend,
// and a confirmation email to the customer.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    // Route by form source
    const source = body.source || 'contact';

    try {
      if (source === 'Build-Your-System Page') {
        await handleQuoteForm(body, env);
      } else {
        await handleContactForm(body, env);
      }
      return json({ ok: true }, 200);
    } catch (err) {
      console.error('Worker error:', err);
      return json({ ok: false, error: err.message }, 500);
    }
  }
};

// ── Quote form (build-your-system.html) ──────────────────────────────────────

async function handleQuoteForm(data, env) {
  const {
    first_name, last_name, email, phone, notes,
    property_type, install_type, protection_tier,
    equipment_cost, install_cost, total_due_today, monthly_monitoring,
    submitted_at
  } = data;

  const fullName = `${first_name || ''} ${last_name || ''}`.trim() || 'Unknown';

  // ── 1. Notify the business ────────────────────────────────────────────────
  const businessHtml = `
<div style="font-family:Inter,system-ui,sans-serif;max-width:640px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:12px;">
  <div style="background:#0d1b3e;padding:20px 24px;border-radius:8px;margin-bottom:24px;">
    <h1 style="color:white;margin:0;font-size:1.3rem;">🔔 New Quote Request — NJ CyberGuard</h1>
  </div>

  <h2 style="color:#0d1b3e;font-size:1rem;margin-bottom:12px;">Customer</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:0.95rem;">
    <tr><td style="padding:8px 12px;background:#e2e8f0;font-weight:600;width:40%;border-radius:4px;">Name</td><td style="padding:8px 12px;">${fullName}</td></tr>
    <tr><td style="padding:8px 12px;background:#e2e8f0;font-weight:600;border-radius:4px;">Email</td><td style="padding:8px 12px;"><a href="mailto:${email}">${email}</a></td></tr>
    <tr><td style="padding:8px 12px;background:#e2e8f0;font-weight:600;border-radius:4px;">Phone</td><td style="padding:8px 12px;">${phone || '—'}</td></tr>
    <tr><td style="padding:8px 12px;background:#e2e8f0;font-weight:600;border-radius:4px;">Notes</td><td style="padding:8px 12px;">${notes || '—'}</td></tr>
    <tr><td style="padding:8px 12px;background:#e2e8f0;font-weight:600;border-radius:4px;">Submitted</td><td style="padding:8px 12px;">${submitted_at || 'N/A'}</td></tr>
  </table>

  <h2 style="color:#0d1b3e;font-size:1rem;margin-bottom:12px;">Selected Configuration</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:0.95rem;">
    <tr><td style="padding:8px 12px;background:#dbeafe;font-weight:600;width:40%;border-radius:4px;">Property Type</td><td style="padding:8px 12px;">${property_type}</td></tr>
    <tr><td style="padding:8px 12px;background:#dbeafe;font-weight:600;border-radius:4px;">Install Type</td><td style="padding:8px 12px;">${install_type}</td></tr>
    <tr><td style="padding:8px 12px;background:#dbeafe;font-weight:600;border-radius:4px;">Protection Tier</td><td style="padding:8px 12px;">${protection_tier}</td></tr>
  </table>

  <h2 style="color:#0d1b3e;font-size:1rem;margin-bottom:12px;">Pricing</h2>
  <table style="width:100%;border-collapse:collapse;font-size:0.95rem;">
    <tr><td style="padding:8px 12px;background:#dcfce7;font-weight:600;width:40%;border-radius:4px;">Equipment</td><td style="padding:8px 12px;">${equipment_cost}</td></tr>
    <tr><td style="padding:8px 12px;background:#dcfce7;font-weight:600;border-radius:4px;">Installation</td><td style="padding:8px 12px;">${install_cost}</td></tr>
    <tr style="font-size:1.05rem;font-weight:700;"><td style="padding:10px 12px;background:#166534;color:white;border-radius:4px;">Total Due Today</td><td style="padding:10px 12px;background:#166534;color:white;">${total_due_today}</td></tr>
    <tr><td style="padding:8px 12px;background:#dcfce7;font-weight:600;border-radius:4px;">Monthly Monitoring</td><td style="padding:8px 12px;">${monthly_monitoring}</td></tr>
  </table>

  <p style="margin-top:24px;font-size:0.85rem;color:#64748b;">
    Reply directly to this email to contact ${fullName}.
  </p>
</div>`;

  await sendEmail(env, {
    from:     'NJ CyberGuard Quotes <quotes@njcyberguard.com>',
    to:       ['info@njcyberguard.com'],
    replyTo:  email,
    subject:  `New Quote Request: ${fullName} — ${total_due_today}`,
    html:     businessHtml
  });

  // ── 2. Confirm to the customer ────────────────────────────────────────────
  const customerHtml = `
<div style="font-family:Inter,system-ui,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:12px;">
  <div style="background:#0d1b3e;padding:20px 24px;border-radius:8px;margin-bottom:24px;text-align:center;">
    <h1 style="color:white;margin:0;font-size:1.4rem;">NJ CyberGuard</h1>
    <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:0.95rem;">Quote Request Received</p>
  </div>

  <p style="font-size:1rem;margin-bottom:20px;">Hi ${first_name || 'there'},</p>
  <p style="margin-bottom:16px;">Thanks for using our system builder! We've received your quote request and will send you a detailed proposal within <strong>1 business day</strong>.</p>

  <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:24px;">
    <h3 style="color:#0d1b3e;margin:0 0 12px;font-size:0.95rem;">Your Configuration</h3>
    <p style="margin:4px 0;font-size:0.9rem;">🏠 <strong>Property:</strong> ${property_type}</p>
    <p style="margin:4px 0;font-size:0.9rem;">🔧 <strong>Install:</strong> ${install_type}</p>
    <p style="margin:4px 0;font-size:0.9rem;">🛡️ <strong>Tier:</strong> ${protection_tier}</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0;">
    <p style="margin:4px 0;font-size:0.9rem;">💰 <strong>Estimated Total:</strong> ${total_due_today}</p>
    <p style="margin:4px 0;font-size:0.9rem;">📅 <strong>Monthly Monitoring:</strong> ${monthly_monitoring}</p>
  </div>

  <p style="margin-bottom:8px;font-size:0.9rem;color:#64748b;">Questions? Reach us directly:</p>
  <p style="margin:0;font-size:0.9rem;color:#64748b;">📧 <a href="mailto:info@njcyberguard.com" style="color:#1a55af;">info@njcyberguard.com</a></p>
  <p style="margin:4px 0;font-size:0.9rem;color:#64748b;">📞 <a href="tel:+19082550663" style="color:#1a55af;">(908) 255-0663</a></p>

  <p style="margin-top:24px;font-size:0.85rem;color:#94a3b8;text-align:center;">NJ CyberGuard · New Jersey's Local Security Experts</p>
</div>`;

  await sendEmail(env, {
    from:    'NJ CyberGuard <quotes@njcyberguard.com>',
    to:      [email],
    subject: 'Your NJ CyberGuard Quote Request',
    html:    customerHtml
  });
}

// ── Generic contact form (index.html) ────────────────────────────────────────

async function handleContactForm(data, env) {
  const { fname, lname, email, phone, service, msg } = data;
  const fullName = `${fname || ''} ${lname || ''}`.trim() || 'Unknown';

  const businessHtml = `
<div style="font-family:Inter,system-ui,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:12px;">
  <div style="background:#0d1b3e;padding:20px 24px;border-radius:8px;margin-bottom:24px;">
    <h1 style="color:white;margin:0;font-size:1.3rem;">📬 New Contact Form Submission</h1>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:0.95rem;">
    <tr><td style="padding:8px 12px;background:#e2e8f0;font-weight:600;width:35%;border-radius:4px;">Name</td><td style="padding:8px 12px;">${fullName}</td></tr>
    <tr><td style="padding:8px 12px;background:#e2e8f0;font-weight:600;border-radius:4px;">Email</td><td style="padding:8px 12px;"><a href="mailto:${email}">${email}</a></td></tr>
    <tr><td style="padding:8px 12px;background:#e2e8f0;font-weight:600;border-radius:4px;">Phone</td><td style="padding:8px 12px;">${phone || '—'}</td></tr>
    <tr><td style="padding:8px 12px;background:#e2e8f0;font-weight:600;border-radius:4px;">Service</td><td style="padding:8px 12px;">${service || '—'}</td></tr>
    <tr><td style="padding:8px 12px;background:#e2e8f0;font-weight:600;border-radius:4px;">Message</td><td style="padding:8px 12px;">${msg || '—'}</td></tr>
  </table>
</div>`;

  await sendEmail(env, {
    from:    'NJ CyberGuard Contact <contact@njcyberguard.com>',
    to:      ['info@njcyberguard.com'],
    replyTo: email,
    subject: `New Contact: ${fullName} — ${service || 'General Inquiry'}`,
    html:    businessHtml
  });
}

// ── Resend helper ─────────────────────────────────────────────────────────────

async function sendEmail(env, { from, to, replyTo, subject, html }) {
  const body = { from, to, subject, html };
  if (replyTo) body.reply_to = replyTo;

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
  return res.json();
}

// ── Utility ───────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}
