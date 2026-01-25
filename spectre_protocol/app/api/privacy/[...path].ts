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

// Rate limiting: simple in-memory store (per-instance)
const requestCounts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 100 // requests per minute
const RATE_WINDOW = 60 * 1000 // 1 minute in ms

// Response cache for frequently accessed endpoints
const responseCache = new Map<string, { data: unknown; expiresAt: number }>()
const CACHE_TTL = {
    'tree/state': 30 * 1000, // Cache tree state for 30 seconds
    'utxos/range': 10 * 1000, // Cache UTXO ranges for 10 seconds
}

function getCachedResponse(path: string): unknown | null {
    const entry = responseCache.get(path)
    if (entry && Date.now() < entry.expiresAt) {
        console.log(`[Proxy] Cache hit for ${path}`)
        return entry.data
    }
    return null
}

function setCachedResponse(path: string, data: unknown): void {
    // Determine TTL based on path
    let ttl = 5000 // Default 5 seconds
    for (const [pattern, patternTtl] of Object.entries(CACHE_TTL)) {
        if (path.includes(pattern)) {
            ttl = patternTtl
            break
        }
    }
    responseCache.set(path, { data, expiresAt: Date.now() + ttl })
}

function checkRateLimit(ip: string): boolean {
    const now = Date.now()
    const entry = requestCounts.get(ip)

    if (!entry || now > entry.resetAt) {
        requestCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW })
        return true
    }

    if (entry.count >= RATE_LIMIT) {
        return false
    }

    entry.count++
    return true
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

    // Rate limiting
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 'unknown'
    if (!checkRateLimit(clientIp)) {
        return res.status(429).json({ error: 'Too many requests' })
    }

    // Get the path from query params (Vercel catch-all route)
    const { path } = req.query
    if (!path) {
        return res.status(400).json({ error: 'Missing path parameter' })
    }

    // Build target URL
    const pathString = Array.isArray(path) ? path.join('/') : path
    const queryString = new URL(req.url || '', 'http://localhost').search
    const targetUrl = `${RELAYER_URL}/${pathString}${queryString}`
    const cacheKey = `${pathString}${queryString}`

    console.log(`[Proxy] ${req.method} ${targetUrl}`)

    // Check cache for GET requests
    if (req.method === 'GET') {
        const cached = getCachedResponse(cacheKey)
        if (cached) {
            return res.status(200).json(cached)
        }
    }

    try {
        const fetchOptions: RequestInit = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Spectre-Protocol/1.0',
            },
        }

        // Add body for POST/PUT requests
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
            fetchOptions.body = JSON.stringify(req.body)
        }

        const response = await fetch(targetUrl, fetchOptions)

        // Forward response status
        if (!response.ok) {
            const errorText = await response.text()
            console.error(`[Proxy] Error from relayer: ${response.status} ${errorText}`)
            return res.status(response.status).json({
                error: 'Relayer error',
                status: response.status,
                message: errorText,
            })
        }

        // Parse and forward response
        const contentType = response.headers.get('content-type')
        if (contentType?.includes('application/json')) {
            const data = await response.json()
            // Cache successful GET responses
            if (req.method === 'GET') {
                setCachedResponse(cacheKey, data)
            }
            return res.status(200).json(data)
        } else {
            const text = await response.text()
            return res.status(200).send(text)
        }
    } catch (error) {
        console.error('[Proxy] Fetch error:', error)
        return res.status(500).json({
            error: 'Proxy failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        })
    }
}
