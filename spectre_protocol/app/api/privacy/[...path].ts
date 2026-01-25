import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Vercel Serverless Proxy for PrivacyCash Relayer
 * 
 * Bypasses CORS restrictions by proxying requests from browser
 * through Vercel's serverless functions.
 * 
 * Routes:
 *   GET  /api/privacy/[...path] → https://api3.privacycash.org/[path]
 *   POST /api/privacy/[...path] → https://api3.privacycash.org/[path]
 */

const RELAYER_URL = 'https://api3.privacycash.org'

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
]

function getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

// Global cache outside handler (serverless instances might persist)
const responseCache = new Map<string, { data: unknown; expiresAt: number; etag?: string }>()

// Aggressive caching for UTXOs (they are immutable blocks)
const CACHE_TTL = {
    'tree/state': 10 * 1000,
    'utxos/range': 60 * 60 * 1000, // 1 hour for UTXO ranges (they don't change often in blocks)
}

function getCachedResponse(path: string): unknown | null {
    const entry = responseCache.get(path)
    if (!entry) return null

    // Serve fresh content
    if (Date.now() < entry.expiresAt) {
        console.log(`[Proxy] Cache hit for ${path}`)
        return entry.data
    }

    // Serve stale content if it's not too old (optional strategy)
    return null
}

function setCachedResponse(path: string, data: unknown): void {
    let ttl = 10 * 1000 // Default 10s
    for (const [pattern, patternTtl] of Object.entries(CACHE_TTL)) {
        if (path.includes(pattern)) {
            ttl = patternTtl
            break
        }
    }
    console.log(`[Proxy] Caching ${path} for ${ttl}ms`)
    responseCache.set(path, { data, expiresAt: Date.now() + ttl })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Enable CORS for browser requests
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end()
    }

    // Get the path from query params
    const { path } = req.query
    if (!path) return res.status(400).json({ error: 'Missing path parameter' })

    const pathString = Array.isArray(path) ? path.join('/') : path
    const queryString = new URL(req.url || '', 'http://localhost').search
    const targetUrl = `${RELAYER_URL}/${pathString}${queryString}`
    const cacheKey = `${pathString}${queryString}`

    // Check cache for GET requests
    if (req.method === 'GET') {
        const cached = getCachedResponse(cacheKey)
        if (cached) {
            return res.status(200).json(cached)
        }
    }

    try {
        // Random pause to avoid burst limit detection (100-500ms)
        await new Promise(r => setTimeout(r, 100 + Math.floor(Math.random() * 400)))

        const fetchOptions: RequestInit = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': getRandomUserAgent(), // Rotate User-Agent
                'X-Forwarded-For': (req.headers['x-forwarded-for'] as string) || '127.0.0.1', // Forward client IP
            },
        }

        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
            fetchOptions.body = JSON.stringify(req.body)
        }

        const response = await fetch(targetUrl, fetchOptions)

        if (!response.ok) {
            // If we get rate limited but have stale cache, return that instead of error
            if (response.status === 429 && req.method === 'GET') {
                const stale = responseCache.get(cacheKey)
                if (stale) {
                    console.warn(`[Proxy] Upstream 429, serving stale cache for ${cacheKey}`)
                    return res.status(200).json(stale.data)
                }
            }

            const errorText = await response.text()
            console.error(`[Proxy] Upstream error: ${response.status} ${errorText.substring(0, 100)}...`)
            return res.status(response.status).json({
                error: 'Relayer error',
                status: response.status,
                message: errorText
            })
        }

        const data = await response.json()

        // Cache successful GET responses
        if (req.method === 'GET') {
            setCachedResponse(cacheKey, data)
        }

        return res.status(200).json(data)
    } catch (error) {
        console.error('[Proxy] Handler error:', error)
        return res.status(500).json({ error: 'Proxy failed' })
    }
}
