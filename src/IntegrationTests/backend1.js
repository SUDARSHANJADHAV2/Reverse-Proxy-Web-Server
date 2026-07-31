const http = require('http');
const WebSocket = require('ws');

// Request tracking
let requestCount = 0;
const startTime = Date.now();

// Create HTTP server with increased max connections
const server = http.createServer({ 
    maxHeaderSize: 16384, // 16KB
    keepAliveTimeout: 60000, // 60 seconds
    headersTimeout: 65000, // 65 seconds - slightly higher than keepAliveTimeout
    maxConnections: 10000 // Allow more concurrent connections
}, (req, res) => {
     requestCount++;
     res.setHeader('Content-Type', 'application/json');
     res.setHeader('Access-Control-Allow-Origin', '*');
     res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
     res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
     // res.setHeader('X-Backend', 'backend1');
     // res.setHeader('X-Request-Count', requestCount.toString());

     // Add CORS headers
     if (req.method === 'OPTIONS') {
          res.writeHead(204);
          return res.end();
     }

     // Basic API endpoints for testing
     if (req.url.startsWith('/api/')) {
          const endpoint = req.url.substring(5);
          
          // Test endpoint
          if (endpoint.startsWith('test')) {
               let body = '';
               req.on('data', chunk => body += chunk);
               req.on('end', () => {
                    // Simulate some processing time
                    setTimeout(() => {
                         res.writeHead(200);
                         res.end(JSON.stringify({
                              method: req.method,
                              path: req.url,
                              body: body ? JSON.parse(body) : null,
                              backend: 'backend1',
                              requestCount,
                              processingTime: Math.random() * 100 + 50 // 50-150ms processing
                         }));
                    }, Math.random() * 100 + 50);
               });
               return;
          }

          // Quick operation
          if (endpoint === 'quick') {
               res.writeHead(200);
               res.end(JSON.stringify({
                    result: 'Quick operation completed',
                    backend: 'backend1',
                    processingTime: 50
               }));
               return;
          }

          // Heavy operation
          if (endpoint === 'heavy') {
               // Simulate heavy processing
               setTimeout(() => {
                    res.writeHead(200);
                    res.end(JSON.stringify({
                         result: 'Heavy operation completed',
                         backend: 'backend1',
                         processingTime: 500
                    }));
               }, 500);
               return;
          }
     }

     // Handle CORS preflight
     if (req.method === 'OPTIONS') {
          res.writeHead(204);
          return res.end();
     }

     // Handle health check
     if (req.url === '/health') {
          res.writeHead(200);
          return res.end(JSON.stringify({
               status: 'healthy',
               requestCount,
               timestamp: new Date().toISOString()
          }));
     }

     // Handle user API
     if (req.url.startsWith('/api/users')) {
          const userId = req.url.split('/')[3];

          switch (req.method) {
               case 'GET':
                    if (userId) {
                         // Get specific user
                         const user = users.get(userId);
                         if (user) {
                              res.writeHead(200);
                              res.end(JSON.stringify(user));
                         } else {
                              res.writeHead(404);
                              res.end(JSON.stringify({ error: 'User not found' }));
                         }
                    } else {
                         // List all users
                         res.writeHead(200);
                         res.end(JSON.stringify(Array.from(users.values())));
                    }
                    break;

               case 'POST':
                    // Create new user
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', () => {
                         try {
                              const userData = JSON.parse(body);
                              const userId = Math.random().toString(36).substr(2, 9);
                              const user = { id: userId, ...userData, createdAt: new Date().toISOString() };
                              users.set(userId, user);
                              res.writeHead(201);
                              res.end(JSON.stringify(user));
                         } catch (err) {
                              res.writeHead(400);
                              res.end(JSON.stringify({ error: 'Invalid JSON' }));
                         }
                    });
                    break;

               case 'PUT':
                    if (!userId) {
                         res.writeHead(400);
                         res.end(JSON.stringify({ error: 'User ID required' }));
                         break;
                    }
                    // Update user
                    body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', () => {
                         try {
                              const userData = JSON.parse(body);
                              const existingUser = users.get(userId);
                              if (!existingUser) {
                                   res.writeHead(404);
                                   res.end(JSON.stringify({ error: 'User not found' }));
                                   return;
                              }
                              const updatedUser = { ...existingUser, ...userData, updatedAt: new Date().toISOString() };
                              users.set(userId, updatedUser);
                              res.writeHead(200);
                              res.end(JSON.stringify(updatedUser));
                         } catch (err) {
                              res.writeHead(400);
                              res.end(JSON.stringify({ error: 'Invalid JSON' }));
                         }
                    });
                    break;

               case 'DELETE':
                    if (!userId) {
                         res.writeHead(400);
                         res.end(JSON.stringify({ error: 'User ID required' }));
                         break;
                    }
                    // Delete user
                    if (users.has(userId)) {
                         users.delete(userId);
                         res.writeHead(204);
                         res.end();
                    } else {
                         res.writeHead(404);
                         res.end(JSON.stringify({ error: 'User not found' }));
                    }
                    break;

               default:
                    res.writeHead(405);
                    res.end(JSON.stringify({ error: 'Method not allowed' }));
          }
          return;
     }

     // Handle other API requests
     res.writeHead(200);
     res.end(JSON.stringify({
          message: 'Hello from Backend 1!',
          path: req.url,
          method: req.method,
          requestCount,
          timestamp: new Date().toISOString()
     }));
});

// Create WebSocket server
const wss = new WebSocket.Server({ server, path: '/ws/persistent' });

// Track connected clients
const clients = new Set();

wss.on('connection', (ws, req) => {
     console.log('New persistent WebSocket connection');
     clients.add(ws);

     // Send welcome message
     ws.send(JSON.stringify({
          type: 'welcome',
          message: 'Connected to persistent WebSocket server',
          timestamp: new Date().toISOString()
     }));

     // Setup ping-pong for connection monitoring
     ws.isAlive = true;
     ws.on('pong', () => {
          ws.isAlive = true;
     });

     // Handle messages
     ws.on('message', (data) => {
          try {
               const message = JSON.parse(data);

               // Echo the message back with timestamp
               ws.send(JSON.stringify({
                    type: 'echo',
                    originalMessage: message,
                    timestamp: new Date().toISOString()
               }));

               // Broadcast to all other clients
               clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                         client.send(JSON.stringify({
                              type: 'broadcast',
                              originalMessage: message,
                              timestamp: new Date().toISOString()
                         }));
                    }
               });
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
          console.log('Client disconnected from persistent connection');
          clients.delete(ws);
     });

     // Handle errors
     ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          clients.delete(ws);
     });
});

// Heartbeat to check connection status
const interval = setInterval(() => {
     wss.clients.forEach((ws) => {
          if (ws.isAlive === false) {
               clients.delete(ws);
               return ws.terminate();
          }
          ws.isAlive = false;
          ws.ping();
     });
}, 30000);

wss.on('close', () => {
     clearInterval(interval);
});

server.listen(9091, () => console.log('Backend 1 running on port 9091'));