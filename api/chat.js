export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'API key not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const origin = req.headers.get('origin') || '';
    const referer = req.headers.get('referer') || '';
    const allowed = ['mochiii.vercel.app', 'localhost'];
    const isAllowed = allowed.some(domain => origin.includes(domain) || referer.includes(domain));

    if (!isAllowed) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const body = await req.json();
        const { messages } = body;

        const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://mochiii.vercel.app',
                'X-Title': 'mochii'
            },
            body: JSON.stringify({
                model: 'google/gemma-4-31b-it:free',
                messages: messages,
                temperature: 0.9,
                max_tokens: 2048,
            })
        });

        const data = await orRes.json();

        if (!orRes.ok) {
            return new Response(JSON.stringify({ error: data.error?.message || 'OpenRouter error' }), {
                status: orRes.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const text = data.choices?.[0]?.message?.content || '';

        return new Response(JSON.stringify({ text }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
