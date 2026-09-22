/* =====================================================================================
   PIXELGAUNT — optional AI game-review proxy (Cloudflare Worker, free tier)
   -------------------------------------------------------------------------------------
   NOT part of the GitHub Pages site — this deploys separately to workers.dev.
   It is the "AI validation service" box in the architecture:

       Frontend (platform.js)  →  this Worker  →  Workers AI  →  { safe, notes }

   Why a Worker: the AI provider key must never sit in frontend JS or the GitHub repo.
   Cloudflare Workers AI has a free daily allowance and needs no billing card to start
   (see the Free tier note below) — that's why it's the default here instead of a paid API.
   The site works fully without this deployed: platform.js checks CONFIG.aiEndpoint,
   and if it's empty or unreachable it just skips this step and relies on the local,
   in-browser checks in platform.js, which are the real pass/fail gate either way.

   DEPLOY (all free):
     1. npm create cloudflare@latest pg-ai-worker -- --type=hello-world
     2. Replace the generated worker with this file's `export default { fetch... }`.
     3. wrangler deploy
     4. Copy the resulting workers.dev URL into CONFIG.aiEndpoint in platform.js.
   No API key to manage: Workers AI is bound to your Cloudflare account (the `env.AI`
   binding below), not called with a bearer key, so there's nothing secret to leak.
   ===================================================================================== */

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*', // tighten to your domain, e.g. https://pixelgaunt.com
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: cors });

    let body;
    try { body = await request.json(); } catch (e) { return json({ available: false, error: 'bad json' }, cors); }
    const html = String(body.html || '').slice(0, 20000);
    const js = String(body.js || '').slice(0, 20000);
    if (!html) return json({ safe: true, notes: [] }, cors);

    const prompt = `You are a security and quality reviewer for user-submitted browser games on a gaming
platform. You are given an HTML file and up to a few JS files from an UNTRUSTED upload.
The game already runs in a locked-down sandboxed iframe with no access to site data, so your
job is NOT to guess at exploits — it's to flag things a human moderator should look at before
listing the game publicly: obfuscated/packed code with no legitimate reason, attempts to break
out of an iframe, cryptomining, phishing content, or anything clearly not a game.
Respond ONLY with compact JSON: {"safe": true|false, "notes": ["short note", ...]}
Keep notes to at most 5 short, plain-language bullet points. If nothing stands out, return
{"safe": true, "notes": []}.

--- HTML (truncated) ---
${html}

--- JS (truncated) ---
${js}`;

    try {
      // Workers AI free-tier model - swap the model string for any other bound model.
      const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400
      });
      const text = (result && (result.response || result.result || '')) + '';
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : { safe: true, notes: [] };
      return json({ available: true, safe: parsed.safe !== false, notes: Array.isArray(parsed.notes) ? parsed.notes.slice(0, 5) : [] }, cors);
    } catch (err) {
      // Fails open: platform.js already treats "unavailable" as "skip this step, local
      // checks stand". A model hiccup should never block a legitimate publish.
      return json({ available: false, error: String(err) }, cors);
    }
  }
};

function json(obj, headers) {
  return new Response(JSON.stringify(obj), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
