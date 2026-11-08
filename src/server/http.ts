/**
 * Server-side HTTP for outbound providers.
 *
 * Node's built-in fetch ignores HTTP_PROXY / HTTPS_PROXY. Behind a corporate proxy
 * (and in several hosted environments) that makes a "key-free live weather" feature
 * silently degrade. This module uses undici's ProxyAgent when a standard proxy env
 * var is present, and a plain request otherwise. All three optional providers
 * (weather, vision, LLM enrichment) share it, so their timeout and proxy behaviour
 * are identical and testable.
 *
 * Never use this for user-controlled URLs without an allowlist: callers here only
 * fetch a configured or hard-coded provider endpoint.
 */

import { request, ProxyAgent, type Dispatcher } from 'undici';

let cachedDispatcher: Dispatcher | undefined;
let inspected = false;

function proxyFromEnv(): string | undefined {
  for (const name of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function dispatcher(): Dispatcher | undefined {
  if (inspected) return cachedDispatcher;
  inspected = true;
  const proxy = proxyFromEnv();
  if (!proxy) return undefined;
  try {
    cachedDispatcher = new ProxyAgent(proxy);
  } catch {
    // A malformed proxy URL should not break the app; fall back to a direct request.
    cachedDispatcher = undefined;
  }
  return cachedDispatcher;
}

export interface HttpJsonResult {
  status: number;
  data: unknown;
}

export interface HttpJsonOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

/** Perform a JSON request with an explicit timeout. Returns the parsed body, or null. */
export async function httpJson(url: string | URL, options: HttpJsonOptions = {}): Promise<HttpJsonResult> {
  const timeout = options.timeoutMs ?? 8000;
  const { statusCode, body } = await request(url, {
    method: options.method ?? 'GET',
    headers: options.headers,
    body: options.body,
    dispatcher: dispatcher(),
    headersTimeout: timeout,
    bodyTimeout: timeout,
  });
  const raw = await body.text();
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  return { status: statusCode, data };
}

/** Exposed for health checks and diagnostics; never returns credentials. */
export function httpStatus(): { proxyConfigured: boolean } {
  return { proxyConfigured: Boolean(proxyFromEnv()) };
}
