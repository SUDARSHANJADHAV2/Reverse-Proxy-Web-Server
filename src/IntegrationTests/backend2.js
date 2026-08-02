const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');

// In-memory cache and tracking
const cache = new Map();
let requestCount = 0;
let cacheHits = 0;
let cacheMisses = 0;

// Cache control settings
const CACHE_DURATION = 60 * 1000; // 60 seconds
const STATIC_PATH = path.join(__dirname, 'static');

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif'
};

// Create HTTP server
const server = http.createServer(async (req, res) => {
    requestCount++;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('X-Backend', 'backend2');
    res.setHeader('X-Request-Count', requestCount.toString());

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    // Handle health check
    if (req.url === '/health') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        return res.end(JSON.stringify({
            status: 'healthy',
            requestCount,
            cacheSize: cache.size,
            timestamp: new Date().toISOString()
        }));
    }

    // Handle static files
    if (req.url.startsWith('/static/')) {
        const relativePath = req.url.substring(8);
        const filePath = path.join(STATIC_PATH, relativePath);
        const ext = path.extname(filePath);
        const mimeType = mimeTypes[ext] || 'application/octet-stream';

        try {
            // Check cache first
            const cachedContent = cache.get(filePath);
            if (cachedContent) {
                res.setHeader('Content-Type', mimeType);
                res.setHeader('X-Cache', 'HIT');
                res.writeHead(200);
                return res.end(cachedContent);
            }

            // Read file and cache it
            const content = await fs.readFile(filePath);
            cache.set(filePath, content);

            // Set cache expiry
            setTimeout(() => {
                cache.delete(filePath);
            }, CACHE_DURATION);

            res.setHeader('Content-Type', mimeType);
            res.setHeader('X-Cache', 'MISS');
            res.writeHead(200);
            return res.end(content);

        } catch (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'File not found' }));
            } else {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        }
        return;
    }

    // Handle cache management
    if (req.url === '/cache/clear' && req.method === 'POST') {
        cache.clear();
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        return res.end(JSON.stringify({
            message: 'Cache cleared',
            timestamp: new Date().toISOString()
        }));
    }

    if (req.url === '/cache/stats' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        return res.end(JSON.stringify({
            size: cache.size,
            keys: Array.from(cache.keys()),
            timestamp: new Date().toISOString()
        }));
    }

    // Handle other requests
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
        message: 'Hello from Backend 2!',
        path: req.url,
        method: req.method,
        requestCount,
        timestamp: new Date().toISOString()
    }));
});

// Create WebSocket server for non-persistent connections
const wss = new WebSocket.Server({ server, path: '/ws/nonpersistent' });

wss.on('connection', (ws, req) => {
    console.log('New non-persistent WebSocket connection');

    // Send welcome message
    ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Connected to non-persistent WebSocket server',
        timestamp: new Date().toISOString()
    }));

    // Set connection timeout
    const timeout = setTimeout(() => {
        ws.send(JSON.stringify({
            type: 'timeout',
            message: 'Connection timeout - closing',
            timestamp: new Date().toISOString()
        }));
        ws.close();
    }, 5000); // 5 seconds timeout

    // Handle messages
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);

            // Echo the message back with timestamp
            ws.send(JSON.stringify({
                type: 'echo',
                originalMessage: message,
                timestamp: new Date().toISOString(),
                timeLeft: Math.max(0, 5000 - (Date.now() - ws.connectTime))
            }));
        } catch (err) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid JSON message',
                timestamp: new Date().toISOString()
            }));
        }
    });

    // Handle client disconnect
    ws.on('close', () => {
        console.log('Client disconnected from non-persistent connection');
        clearTimeout(timeout);
    });

    // Handle errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clearTimeout(timeout);
    });

    // Store connection time
    ws.connectTime = Date.now();
});

server.listen(9092, () => console.log('Backend 2 running on port 9092'));