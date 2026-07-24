export async function onRequest(context) {
    const origin = context.request.headers.get("Origin") || context.request.headers.get("origin") || "*";

    if (context.request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, X-MBX-APIKEY",
                "Access-Control-Max-Age": "86400",
            },
        });
    }

    try {
        const url = new URL(context.request.url);
        const targetUrl = url.searchParams.get("url");

        if (!targetUrl) {
            return new Response(JSON.stringify({ error: "Missing 'url' parameter" }), {
                status: 400,
                headers: {
                    "Access-Control-Allow-Origin": origin,
                    "Content-Type": "application/json",
                },
            });
        }

        const parsed = new URL(targetUrl);
        if (!parsed.hostname.endsWith("binance.com")) {
            return new Response(JSON.stringify({ error: "Only Binance URLs allowed" }), {
                status: 403,
                headers: {
                    "Access-Control-Allow-Origin": origin,
                    "Content-Type": "application/json",
                },
            });
        }

        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
        };
        const apiKey = context.request.headers.get("X-MBX-APIKEY");
        if (apiKey) {
            headers["X-MBX-APIKEY"] = apiKey;
        }

        const response = await fetch(targetUrl, {
            method: "GET",
            headers,
        });

        const data = await response.text();

        return new Response(data, {
            status: response.status,
            headers: {
                "Access-Control-Allow-Origin": origin,
                "Content-Type": "application/json",
            },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: {
                "Access-Control-Allow-Origin": origin,
                "Content-Type": "application/json",
            },
        });
    }
}
