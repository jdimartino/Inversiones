import { getFunctions, httpsCallable } from "firebase/functions";

export async function signBinanceRequest(path: string, params: Record<string, string> = {}): Promise<any> {
    try {
        const functions = getFunctions();
        const signCallable = httpsCallable(functions, "signBinanceRequest");
        const result = await signCallable({ path, params });
        return result.data as any;
    } catch (error: any) {
        console.error("[signBinanceRequest] Error:", error?.code, error?.message);
        throw error;
    }
}

export async function fetchBinanceFutures(
    path: string,
    params: Record<string, string> = {}
): Promise<any> {
    try {
        const signatureData = await signBinanceRequest(path, params);

        if (!signatureData?.success) {
            throw new Error("signBinanceRequest returned success=false");
        }

        const { apiKey, timestamp, signature, recvWindow } = signatureData;

        const queryString = new URLSearchParams({
            ...params,
            timestamp: String(timestamp),
            recvWindow: String(recvWindow),
        }).toString();

        const url = `https://fapi.binance.com${path}?${queryString}&signature=${signature}`;

        const response = await fetch(url, {
            headers: {
                "X-MBX-APIKEY": apiKey,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[fetchBinanceFutures] Binance error:", response.status, errorText.substring(0, 200));
            throw new Error(`Binance API error: ${response.status} - ${errorText}`);
        }

        return await response.json();
    } catch (error: any) {
        console.error("[fetchBinanceFutures] Error:", error?.message);
        throw error;
    }
}
