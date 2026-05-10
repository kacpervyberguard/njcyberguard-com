// subscribe.js — Cloudflare Pages Function
// The RESEND_API_KEY is restricted to "send emails only" and cannot
// manage audiences. We capture subscribers by emailing the site owner.
// If a full API key with audience access is later added as RESEND_AUDIENCE_KEY,
// the function will also add the contact to the Resend audience list.

export async function onRequestPost(context) {
  const { request, env } = context;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const data = await request.json();
    const { email, name } = data;

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400, headers
      });
    }

    const displayName = (name || '').trim() || email;

    // --- Primary path: send notification email via Resend ---
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'NJ CyberGuard <onboarding@resend.dev>',
        to: ['nkacper1324@gmail.com'],
        subject: `New Newsletter Subscriber: ${displayName}`,
        html: `<p><strong>New subscriber</strong></p>
               <p>Name: ${displayName}</p>
               <p>Email: <a href="mailto:${email}">${email}</a></p>`,
        text: `New subscriber\nName: ${displayName}\nEmail: ${email}`
      })
    });

    if (!emailRes.ok) {
      const detail = await emailRes.text();
      console.error('Resend email error:', detail);
      return new Response(JSON.stringify({ error: 'Subscription failed' }), {
        status: 500, headers
      });
    }

    // --- Optional secondary path: add to audience if full-access key provided ---
    const audienceKey = env.RESEND_AUDIENCE_KEY;
    const audienceId = env.RESEND_AUDIENCE_ID;

    if (audienceKey && audienceId) {
      const nameParts = (name || '').trim().split(' ');
      const contactPayload = { email, unsubscribed: false };
      if (nameParts[0]) contactPayload.first_name = nameParts[0];
      if (nameParts.length > 1) contactPayload.last_name = nameParts.slice(1).join(' ');

      const contactRes = await fetch(
        `https://api.resend.com/audiences/${audienceId}/contacts`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${audienceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(contactPayload)
        }
      );
      if (!contactRes.ok) {
        // Log but don't fail — email notification already succeeded
        const detail = await contactRes.text();
        console.warn('Resend audience contact error (non-fatal):', detail);
      }
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
