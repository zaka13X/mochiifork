export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
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

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: messages,
                    generationConfig: {
                        temperature: 0.9,
                        maxOutputTokens: 2048,
                    }
                })
            }
        );

        const data = await geminiRes.json();

        if (!geminiRes.ok) {
            return new Response(JSON.stringify({ error: data.error?.message || 'Gemini error' }), {
                status: geminiRes.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

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
