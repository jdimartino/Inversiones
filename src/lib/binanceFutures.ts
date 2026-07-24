import { getFunctions, httpsCallable } from "firebase/functions";

export async function signBinanceRequest(path: string, params: Record<string, string> = {}): Promise<any> {
    try {
        console.log("[signBinanceRequest] Calling CF...", { path, params });
        const functions = getFunctions();
        const signCallable = httpsCallable(functions, "signBinanceRequest");
        
        const result = await signCallable({ path, params });
        const data = result.data as any;
        console.log("[signBinanceRequest] CF response:", { success: data?.success, hasApiKey: !!data?.apiKey, timestamp: data?.timestamp });
        return data;
    } catch (error: any) {
        console.error("[signBinanceRequest] Error:", error?.code, error?.message, error);
        throw error;
    }
}

export async function fetchBinanceFutures(
    path: string,
    params: Record<string, string> = {}
): Promise<any> {
    try {
        console.log("[fetchBinanceFutures] Starting...", { path, params });
        const signatureData = await signBinanceRequest(path, params);
        
        if (!signatureData?.success) {
            throw new Error("signBinanceRequest returned success=false: " + JSON.stringify(signatureData));
        }

        const { apiKey, timestamp, signature, recvWindow } = signatureData;
        
        const queryString = new URLSearchParams({
            ...params,
            timestamp: String(timestamp),
            recvWindow: String(recvWindow),
        }).toString();
        
        const url = `https://fapi.binance.com${path}?${queryString}&signature=${signature}`;
        console.log("[fetchBinanceFutures] Fetching Binance...", { path, url: url.substring(0, 120) + "..." });
        
        const response = await fetch(url, {
            headers: {
                "X-MBX-APIKEY": apiKey,
            },
        });
        
        console.log("[fetchBinanceFutures] Response status:", response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("[fetchBinanceFutures] Binance error:", response.status, errorText.substring(0, 200));
            throw new Error(`Binance API error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log("[fetchBinanceFutures] Success!", { path, isArray: Array.isArray(data), length: Array.isArray(data) ? data.length : undefined });
        return data;
    } catch (error: any) {
        console.error("[fetchBinanceFutures] Error:", error?.message, error);
        throw error;
    }
}
