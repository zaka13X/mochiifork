export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            }
        });
    }

    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const apiKey = process.env.GROQ_API_KEY;
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

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                messages: messages,
                temperature: 0.9,
                max_tokens: 2048,
            })
        });

        const data = await groqRes.json();

        if (!groqRes.ok) {
            return new Response(JSON.stringify({ error: JSON.stringify(data.error) || 'Groq error' }), {
                status: groqRes.status,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
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
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }
}
