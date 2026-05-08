// Cache audience ID for the lifetime of this Worker instance
let cachedAudienceId = null;

async function getAudienceId(apiKey) {
  if (cachedAudienceId) return cachedAudienceId;

  // List existing audiences
  const listRes = await fetch('https://api.resend.com/audiences', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const listData = await listRes.json();
  const audiences = listData.data || [];

  // Look for "NJ Security Newsletter" or use first available
  const existing = audiences.find(a => a.name === 'NJ Security Newsletter') || audiences[0];
  if (existing) {
    cachedAudienceId = existing.id;
    return cachedAudienceId;
  }

  // Create a new audience
  const createRes = await fetch('https://api.resend.com/audiences', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: 'NJ Security Newsletter' })
  });
  const created = await createRes.json();
  cachedAudienceId = created.id;
  return cachedAudienceId;
}

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

    const audienceId = await getAudienceId(env.RESEND_API_KEY);
    if (!audienceId) {
      return new Response(JSON.stringify({ error: 'Could not resolve audience' }), {
        status: 500, headers
      });
    }

    // Build contact payload
    const nameParts = (name || '').trim().split(' ');
    const contactPayload = {
      email,
      unsubscribed: false
    };
    if (nameParts[0]) contactPayload.first_name = nameParts[0];
    if (nameParts.length > 1) contactPayload.last_name = nameParts.slice(1).join(' ');

    const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(contactPayload)
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Resend subscribe error:', detail);
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
