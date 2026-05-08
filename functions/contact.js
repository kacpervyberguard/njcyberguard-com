export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const data = await request.json();
    const { fname, lname, email, phone, service, msg } = data;

    if (!fname || !lname || !email || !service) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers
      });
    }

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#1a1a2e;border-bottom:2px solid #0066cc;padding-bottom:10px;">
          New Quote Request — NJ CyberGuard
        </h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#666;width:140px;font-weight:600;">Name</td>
              <td style="padding:8px 0;color:#1a1a2e;">${fname} ${lname}</td></tr>
          <tr><td style="padding:8px 0;color:#666;font-weight:600;">Email</td>
              <td style="padding:8px 0;"><a href="mailto:${email}" style="color:#0066cc;">${email}</a></td></tr>
          <tr><td style="padding:8px 0;color:#666;font-weight:600;">Phone</td>
              <td style="padding:8px 0;color:#1a1a2e;">${phone || 'Not provided'}</td></tr>
          <tr><td style="padding:8px 0;color:#666;font-weight:600;">Service</td>
              <td style="padding:8px 0;color:#1a1a2e;">${service}</td></tr>
        </table>
        <h3 style="color:#1a1a2e;margin-top:20px;">Message</h3>
        <p style="color:#444;background:#f5f7fa;padding:16px;border-radius:8px;line-height:1.6;">
          ${msg ? msg.replace(/\n/g, '<br>') : '<em>No message provided</em>'}
        </p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #eee;">
        <p style="color:#888;font-size:0.85em;">
          Sent from the contact form at <a href="https://njcyberguard.com">njcyberguard.com</a>
        </p>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'NJ CyberGuard Website <info@njcyberguard.com>',
        to: ['info@njcyberguard.com', 'damian.barczewski.co@gmail.com'],
        reply_to: email,
        subject: `Quote Request: ${service} — ${fname} ${lname}`,
        html
      })
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Resend error:', detail);
      return new Response(JSON.stringify({ error: 'Email delivery failed' }), {
        status: 500, headers
      });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers });

  } catch (err) {
    console.error('Contact handler error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers
    });
  }
}

// Handle preflight CORS
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
