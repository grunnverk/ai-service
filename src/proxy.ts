/**
 * Proxy support for LLM API requests.
 *
 * When HTTPS_PROXY or https_proxy is set, routes requests through the proxy
 * using undici's ProxyAgent. Required for environments behind corporate
 * firewalls that require proxy access to reach Anthropic/OpenAI APIs.
 */

import { ProxyAgent } from 'undici';

/**
 * Get the proxy URL from environment variables.
 * Checks HTTPS_PROXY and https_proxy (lowercase takes precedence per convention).
 */
export function getProxyUrl(): string | undefined {
    return process.env.https_proxy || process.env.HTTPS_PROXY;
}

/**
 * Create a fetch implementation that routes requests through an HTTP(S) proxy.
 * Use when initializing Anthropic or OpenAI SDK clients in proxied environments.
 *
 * @param proxyUrl - The proxy URL (e.g. https://proxy.example.com:8080)
 * @returns A fetch function that uses ProxyAgent as the dispatcher
 */
export function createProxyFetch(proxyUrl: string): typeof fetch {
    const proxyAgent = new ProxyAgent({ uri: proxyUrl });
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const fetchInit = { ...init, dispatcher: proxyAgent } as RequestInit;
        return fetch(input, fetchInit);
    };
}
