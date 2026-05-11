// NJ CyberGuard — Daily Newsletter Worker
// Runs daily at 9 AM ET via cron trigger
// Fetches real stories from verified sources, then uses Grok to write the briefing

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendNewsletter(env));
  },

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

// ─── News sources ─────────────────────────────────────────────────────────────
// All RSS/Atom feeds from verifiable, authoritative sources

const SOURCES = [
  // ── NJ Government & Law Enforcement (highest priority) ──────────────────────
  { name: 'FBI Newark',              url: 'https://www.fbi.gov/contact-us/field-offices/newark/rss.xml',              nj: true  },
  { name: 'NJ Attorney General',     url: 'https://www.njoag.gov/feed/',                                              nj: true  },
  { name: 'NJ State Police News',    url: 'https://www.njsp.org/news/rss.xml',                                        nj: true  },
  { name: 'NJ Office of Homeland Security', url: 'https://www.njhomelandsecurity.gov/feed',                           nj: true  },
  // ── Federal Agencies ─────────────────────────────────────────────────────────
  { name: 'CISA Alerts',             url: 'https://www.cisa.gov/uscert/ncas/alerts.xml',                              nj: false },
  { name: 'CISA Current Activity',   url: 'https://www.cisa.gov/uscert/ncas/current-activity.xml',                    nj: false },
  { name: 'FTC Consumer Alerts',     url: 'https://www.ftc.gov/news-events/news/press-releases/rss.xml',              nj: false },
  { name: 'IC3 / FBI Cyber',         url: 'https://www.ic3.gov/Media/News/rss',                                       nj: false },
  { name: 'US-CERT Bulletins',       url: 'https://www.cisa.gov/uscert/ncas/bulletins.xml',                           nj: false },
  // ── NJ Local News (scams, fraud, crime) ─────────────────────────────────────
  { name: 'NJ.com News',             url: 'https://www.nj.com/news/rss2.0.xml',                                       nj: true  },
  { name: 'NJ Spotlight News',       url: 'https://njspotlightnews.org/feed/',                                        nj: true  },
  { name: 'NJ Herald',               url: 'https://www.njherald.com/search/?q=scam+hack+fraud+cyber&f=rss',           nj: true  },
  { name: 'Asbury Park Press',       url: 'https://www.app.com/rss/news/',                                            nj: true  },
  // ── Google News NJ Cybersecurity (pulls real current headlines) ──────────────
  { name: 'Google News: NJ Scams',   url: 'https://news.google.com/rss/search?q=New+Jersey+scam+OR+fraud+OR+cyber+attack&hl=en-US&gl=US&ceid=US:en', nj: true },
  { name: 'Google News: NJ Hacks',   url: 'https://news.google.com/rss/search?q=New+Jersey+hack+OR+breach+OR+ransomware&hl=en-US&gl=US&ceid=US:en',   nj: true },
  // ── Reputable Cybersecurity Press ────────────────────────────────────────────
  { name: 'Krebs on Security',       url: 'https://krebsonsecurity.com/feed/',                                        nj: false },
  { name: 'BleepingComputer',        url: 'https://www.bleepingcomputer.com/feed/',                                   nj: false },
  { name: 'The Hacker News',         url: 'https://feeds.feedburner.com/TheHackersNews',                              nj: false },
  { name: 'SecurityWeek',            url: 'https://feeds.feedburner.com/securityweek',                                nj: false },
  { name: 'Dark Reading',            url: 'https://www.darkreading.com/rss_simple.asp',                               nj: false },
  { name: 'Threatpost',              url: 'https://threatpost.com/feed/',                                             nj: false },
  { name: 'Naked Security (Sophos)', url: 'https://nakedsecurity.sophos.com/feed/',                                   nj: false },
];

// Keywords that boost a story's priority score
// NJ geography gets a 10x multiplier; threat types get 1–3x
const PRIORITY_KEYWORDS = [
  // NJ geography (10x weight each)
  'new jersey', ' nj ', 'newark', 'trenton', 'jersey city', 'hoboken', 'camden',
  'edison', 'woodbridge', 'hamilton', 'clifton', 'paterson', 'elizabeth',
  'cherry hill', 'parsippany', 'hackensack', 'passaic', 'union city',
  'atlantic city', 'princeton', 'morristown', 'montclair', 'toms river',
  // High-priority threat types (3x weight)
  'scam', 'phishing', 'ransomware', 'hack', 'hacked', 'data breach', 'breach',
  'network attack', 'cyberattack', 'cyber attack', 'fraud', 'identity theft',
  'extortion', 'business email compromise', 'bec',
  // General cybersecurity (1x weight)
  'malware', 'vulnerability', 'exploit', 'stolen', 'data leak', 'credential',
  'botnet', 'zero-day', 'cve', 'trojan', 'spyware', 'ddos', 'social engineering',
  'smishing', 'vishing', 'romance scam', 'tech support scam', 'gift card scam',
  'wire fraud', 'crypto scam', 'pig butchering', 'account takeover',
  // Physical crime with digital/financial angle
  'skimming', 'card skimmer', 'atm fraud', 'package theft', 'porch pirate',
  'mail theft', 'check washing', 'check fraud', 'stolen mail', 'motor vehicle theft',
  'car theft', 'catalytic converter', 'shoplifting ring', 'organized retail crime',
  'robbery', 'arrest', 'charged', 'indicted', 'sentenced', 'convicted',
  // Consumer protection
  'recall', 'warning', 'alert', 'advisory', 'consumer protection', 'price gouging',
  'contractor fraud', 'home improvement scam', 'medicare fraud', 'medicaid fraud',
  'tax fraud', 'irs scam', 'social security scam', 'lottery scam', 'sweepstakes scam'
];

// ─── Main orchestrator ────────────────────────────────────────────────────────

async function sendNewsletter(env) {
  console.log('Newsletter job started');

  const resendKey = env.RESEND_API_KEY;

  const [stories, subscribers] = await Promise.all([
    fetchStories(),
    getSubscribers(resendKey)
  ]);

  if (!subscribers.length) {
    console.log('No active subscribers — skipping send');
    return;
  }

  console.log(`Fetched ${stories.length} stories, ${subscribers.length} subscribers`);

  const content = await generateContent(env.GROK_API_KEY, stories);
  await sendEmails(resendKey, content, subscribers);
  console.log(`Newsletter delivered to ${subscribers.length} subscribers`);
}

// ─── RSS fetching & parsing ───────────────────────────────────────────────────

async function fetchStories() {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000; // last 48 hours

  const results = await Promise.allSettled(
    SOURCES.map(src => fetchFeed(src, cutoff))
  );

  const all = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  // Score each story: NJ stories and specific threat types rank highest
  const NJ_GEO = new Set(['new jersey',' nj ','newark','trenton','jersey city','hoboken','camden',
    'edison','woodbridge','hamilton','clifton','paterson','elizabeth','cherry hill','parsippany',
    'hackensack','passaic','union city','atlantic city','princeton','morristown','montclair','toms river']);
  const HIGH_THREAT = new Set(['scam','phishing','ransomware','hack','hacked','data breach','breach',
    'network attack','cyberattack','cyber attack','fraud','identity theft','extortion',
    'business email compromise','bec']);

  const scored = all.map(s => {
    const text = (s.title + ' ' + s.description).toLowerCase();
    let score = 0;
    for (const kw of PRIORITY_KEYWORDS) {
      if (text.includes(kw)) {
        if (NJ_GEO.has(kw))       score += 15;
        else if (HIGH_THREAT.has(kw)) score += 3;
        else                          score += 1;
      }
    }
    if (s.njSource) score += 8; // bonus for NJ-sourced feeds
    return { ...s, score };
  });

  // Sort by score desc, then recency desc; take top 20
  scored.sort((a, b) => b.score - a.score || b.pubDate - a.pubDate);
  return scored.slice(0, 20);
}

async function fetchFeed(src, cutoff) {
  try {
    const res = await fetch(src.url, {
      headers: { 'User-Agent': 'NJCyberGuard-Newsletter/1.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml, src.name, src.nj, cutoff);
  } catch (e) {
    console.warn(`Failed to fetch ${src.name}: ${e.message}`);
    return [];
  }
}

function parseRss(xml, sourceName, njSource, cutoff) {
  const items = [];
  const itemRegex = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = stripTags(extract(block, 'title')).trim();
    const link  = extract(block, 'link') || extract(block, 'id') || '';
    const desc  = stripTags(extract(block, 'description') || extract(block, 'summary') || '').slice(0, 300).trim();
    const dateStr = extract(block, 'pubDate') || extract(block, 'published') || extract(block, 'updated') || '';
    const pubDate = dateStr ? new Date(dateStr).getTime() : 0;
    if (!title || pubDate < cutoff) continue;
    items.push({ title, link: link.trim(), description: desc, pubDate, source: sourceName, njSource });
  }
  return items;
}

function extract(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>(?:!<\\[CDATA\U�=�(.*?)(?:\\]\\]>)?<\\/${tag}>`, 'si');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '').replace(/\s+/g, ' ');
}

async function generateContent(apiKey, stories) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York'
  });

  const storyList = stories.map((s, i) =>
    `[${i + 1}] ${s.njSource ? '🔴 NJ-LOCAL: ' : ''}${s.source}\n    "${s.title}"\n    ${s.description ? s.description + '\n    ' : ''}Link: ${s.link}`
  ).join('\n\n');

  const prompt = `You are writing the NJ CyberGuard Daily Security Briefing for ${today}.

Your audience: New Jersey small business owners, IT managers, and residents who want to stay ahead of cyber threats targeting their community.

Below are today's real, verified stories pulled from authoritative sources (FBI Newark, NJ AG, NJ State Police, CISA, Krebs on Security, BleepingComputer, NJ.com, etc.). Stories marked 🔴 NJ-LOCAL are from NJ-based sources or mention NJ directly — these are your highest priority. Use ONLY these stories — never invent, speculate, or add details not in the source. Always cite the source name and include the link.

STORIES:
${storyList}

Write the briefing using these five sections. Use <h2> for section headings, <p> and <ul><li> for body:

1. **🔴 NJ Spotlight** — LEAD with NJ-LOCAL stories first. Cover scams targeting NJ residents, attacks on NJ businesses or government, local arrests/convictions for fraud/theft, or NJ-specific advisories. If no direct NJ story today, take the most relevant national story and explain specifically how it affects NJ residents.

2. **⚠️ Attacks & Breaches** — Cover 2–3 significant network attacks, hacks, ransomware incidents, or data breaches. For each: what happened, who was hit, and what it means for regular people or businesses. Cite source, link it as <a href="URL">Source Name</a>.

3. **🎣 Scam & Fraud Watch* * — Focus on active scams, phishing campaigns, fraud schemes, identity theft, card skimming, check fraud, fake contractors, IRS/Social Security scams, or any consumer fraud. Be specific: what it looks like, who it targets, the red flags. Prioritize NJ-specific ones.

4. **🚨 Community Safety** — Cover theft, robbery, package theft, mail theft, ATM skimming, organized retail crime, car theft, or any physical crime with a financial/safety impact on NJ communities. Include any relevant arrests. If no NJ-specific physical crime story is in the feed today, skip this section.

5. **🛡️ Action Item** — One concrete, specific action NJ residents or businesses should take TODAY based on today's stories. Be specific (e.g., "patch CVE-XXXX", "alert staff about this phishing lure", "check your mailbox for stolen checks", "look for card skimmers at these types of locations"). Never be generic.

Keep total under 550 words. Plain English — explain any technical terms. Start directly with the first <h2>.`;

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-3-mini',
      messages: [
        { role: 'system', content: 'You are a cybersecurity journalist specializing in New Jersey. You write concise, plain-English briefings for NJ small businesses and residents. You only report on verified, real stories provided to you — never fabricate details or invent stories. Always cite the source by name. Prioritize NJ-local scams, organized theft, fraud, network attacks, and hacks above all else.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1200,
      temperature: 0.4
    })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Grok API error: ${res.status} -- ${err}`); }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function getSubscribers(resendApiKey) {
  const AUDIENCE_ID = '18fcdedb-8008-4d8c-9df9-a0664d4cce29';
  const res = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
    headers: { 'Authorization': `Bearer ${resendApiKey}` }
  });
  if (!res.ok) { console.error('Failed to fetch contacts:', await res.text()); return []; }
  const data = await res.json();
  return (data.data || []).filter(c => !c.unsubscribed && c.email);
}

async function sendEmails(resendApiKey, htmlContent, subscribers) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York'
  });
  const fullHtml = buildEmailHtml(htmlContent, today);
  const subject = `🛡️ NJ Security Briefing — ${today}`;
  const emails = subscribers.map(s => s.email);
  for (let i = 0; i < emails.length; i += 50) {
    const batch = emails.slice(i, i + 50);
    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'NJ CyberGuard <newsletter@njcyberguard.com>', to: batch, subject, html: fullHtml })
    });
    if (!sendRes.ok) { const err = await sendRes.text(); console.error(`Resend error (batch ${i / 50 + 1}): ${err}`); }
    else { console.log(`Batch ${i / 50 + 1} sent (${batch.length} recipients)`); }
  }
}

function buildEmailHtml(content, dateStr) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NJ CyberGuard Daily Briefing</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',system-ui,sans-serif;">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0d1b3e 0%,#1a3068 55%,#1a55af 100%);padding:36px 40px;">
      <div style="color:#bdd4ff;font-size:0.72rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:10px;">🛡️ Daily Security Briefing</div>
      <div style="color:#fff;font-size:1.6rem;font-weight:800;line-height:1.2;">NJ CyberGuard</div>
      <div style="color:rgba(255,255,255,0.6);font-size:0.85rem;margin-top:8px;">${dateStr}</div>
      <div style="margin-top:14px;font-size:0.78rem;color:#7da8e0;">Sourced from FBI Newark · NJ AT… NJ State Police CISA · Krebs on Security · BleepingComputer · NJ.com</div>
    </div>
    <div style="padding:36px 40px;color:#1a1a2e;line-height:1.75;font-size:0.97rem;">
      <style>h2 {color:#0d1b3e;font-size:1.05rem;font-weight:700;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid #e2e8f0;} h2:first-child{margin-top:0;} p {margin:0 0 14px;color:#334155;} ul {margin:0 0 14px;padding-left:20px;color:#334155;} li {margin-bottom:6px;} strong {color:#0d1b3e;} a {color:#1a55af;}</style>
      ${content}
    </div>
    <div style="margin:0 40px 28px;padding:14px 18px;background:#f7f9ff;border-left:4px solid #1a55af;border-radius:4px;">
      <p style="margin:0;font-size:0.78rem;color:#64748b;"><strong style="color:#0d1b3e;">Sources:</strong> FBI Newark, NJ Attorney General, NJ State Police, NJ Office of Homeland Security, CISA, FTCIC, NH�com, NJ Spotlight News, Krebs on Security, BleepingComputer, The Hacker News, SecurityWeek, Dark Reading, Threatpost. Stories sourced from verified publications at time of delivery.</p>
    </div>
    <div style="padding:0 40px 32px;text-align:center;">
      <a href="https://njcyberguard.com/#contact" style="display:inline-block;background:#1a55af;color:#fff;text-decoration:none;padding:13px 30px;border-radius:6px;font-weight:600;font-size:0.92rem;">Get a Free Security Assessment →</a>
    </div>
    <div style="padding:24px 40px;background:#f7f9ff;border-top:1px solid #e2e8f0;">
      <p style="color:#64748b;font-size:0.8rem;margin:0 0 6px;text-align:center;">You're receiving this because you subscribed at <a href="https://njcyberguard.com" style="color:#1a55af;text-decoration:none;">njcyberguard.com</a></p>
      <p style="color:#94a3b8;font-size:0.75rem;margin:0;text-align:center;">Questions? Contact <a href="mailto:info@njcyberguard.com" style="color:#1a55af;text-decoration:none;">info@njcyberguard.com</a> &nbsp;·&nbsp; To unsubscribe, reply with "unsubscribe"</p>
    </div>
  </div>
</body>
</html>`;
}
