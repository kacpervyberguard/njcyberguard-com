// subscribe.js — Cloudflare Pages Function
// Adds subscribers directly to the Resend audience list.

const AUDIENCE_ID = '18fcdedb-8008-4d8c-9df9-a0664d4cce29';

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
    const payload = { email, unsubscribed: false };
    if (nameParts[0]) payload.first_name = nameParts[0];
    if (nameParts.length > 1) payload.last_name = nameParts.slice(1).join(' ');

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
      console.error('Resend error:', detail);
      return new Response(JSON.stringify({ error: 'Subscription failed' }), {
        status: 500, headers
      });
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
