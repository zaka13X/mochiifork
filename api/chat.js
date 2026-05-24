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

        // Convert any image_url messages that use base64 to text-only
        // since free models may not support base64 image_url
        const cleanedMessages = messages.map(msg => {
            if (!Array.isArray(msg.content)) {
                return msg;
            }
            // flatten content array: keep text parts, describe images as [screenshot attached]
            const textParts = msg.content
                .map(part => {
                    if (part.type === 'text') return part.text;
                    if (part.type === 'image_url') return '[user attached a screenshot]';
                    return '';
                })
                .filter(Boolean)
                .join('\n');
            return { role: msg.role, content: textParts };
        });

        const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://mochiii.vercel.app',
                'X-Title': 'mochii'
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-3.3-70b-instruct:free',
                messages: cleanedMessages,
                temperature: 0.9,
                max_tokens: 2048,
            })
        });

        const data = await orRes.json();

        if (!orRes.ok) {
            return new Response(JSON.stringify({ error: JSON.stringify(data.error) || 'OpenRouter error' }), {
                status: orRes.status,
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
