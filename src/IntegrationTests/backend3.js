const http = require('http');
const crypto = require('crypto');

// In-memory stores
const users = new Map();
const sessions = new Map();
let requestCount = 0;

// Helper functions
const generateToken = () => crypto.randomBytes(32).toString('hex');
const hashPassword = (password) => crypto.createHash('sha256').update(password).digest('hex');

const server = http.createServer((req, res) => {
     requestCount++;
     res.setHeader('Content-Type', 'application/json');
     res.setHeader('Access-Control-Allow-Origin', '*');
     res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
     res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
     res.setHeader('X-Backend', 'backend3');
     res.setHeader('X-Request-Count', requestCount.toString());

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
               activeUsers: users.size,
               activeSessions: sessions.size,
               timestamp: new Date().toISOString()
          }));
     }

     // Authentication endpoints
     if (req.url.startsWith('/auth')) {
          switch (req.url) {
               case '/auth/register':
                    if (req.method === 'POST') {
                         let body = '';
                         req.on('data', chunk => body += chunk);
                         req.on('end', () => {
                              try {
                                   const { username, password } = JSON.parse(body);
                                   if (!username || !password) {
                                        res.writeHead(400);
                                        res.end(JSON.stringify({ error: 'Username and password required' }));
                                        return;
                                   }
                                   if (users.has(username)) {
                                        res.writeHead(409);
                                        res.end(JSON.stringify({ error: 'Username already exists' }));
                                        return;
                                   }
                                   users.set(username, {
                                        username,
                                        passwordHash: hashPassword(password),
                                        createdAt: new Date().toISOString()
                                   });
                                   res.writeHead(201);
                                   res.end(JSON.stringify({ message: 'User registered successfully' }));
                              } catch (err) {
                                   res.writeHead(400);
                                   res.end(JSON.stringify({ error: 'Invalid JSON' }));
                              }
                         });
                         return;
                    }
                    break;

               case '/auth/login':
                    if (req.method === 'POST') {
                         let body = '';
                         req.on('data', chunk => body += chunk);
                         req.on('end', () => {
                              try {
                                   const { username, password } = JSON.parse(body);
                                   const user = users.get(username);
                                   if (!user || user.passwordHash !== hashPassword(password)) {
                                        res.writeHead(401);
                                        res.end(JSON.stringify({ error: 'Invalid credentials' }));
                                        return;
                                   }
                                   const token = generateToken();
                                   sessions.set(token, {
                                        username,
                                        createdAt: new Date().toISOString(),
                                        lastAccess: new Date().toISOString()
                                   });
                                   res.writeHead(200);
                                   res.end(JSON.stringify({ token }));
                              } catch (err) {
                                   res.writeHead(400);
                                   res.end(JSON.stringify({ error: 'Invalid JSON' }));
                              }
                         });
                         return;
                    }
                    break;

               case '/auth/logout':
                    if (req.method === 'POST') {
                         const token = req.headers.authorization?.split(' ')[1];
                         if (token && sessions.has(token)) {
                              sessions.delete(token);
                              res.writeHead(200);
                              res.end(JSON.stringify({ message: 'Logged out successfully' }));
                         } else {
                              res.writeHead(401);
                              res.end(JSON.stringify({ error: 'Invalid token' }));
                         }
                         return;
                    }
                    break;

               case '/auth/verify':
                    if (req.method === 'GET') {
                         const token = req.headers.authorization?.split(' ')[1];
                         if (token && sessions.has(token)) {
                              const session = sessions.get(token);
                              session.lastAccess = new Date().toISOString();
                              res.writeHead(200);
                              res.end(JSON.stringify({
                                   valid: true,
                                   username: session.username,
                                   lastAccess: session.lastAccess
                              }));
                         } else {
                              res.writeHead(401);
                              res.end(JSON.stringify({ valid: false, error: 'Invalid token' }));
                         }
                         return;
                    }
                    break;
          }
     }

     // Protected endpoint example
     if (req.url === '/protected') {
          const token = req.headers.authorization?.split(' ')[1];
          if (!token || !sessions.has(token)) {
               res.writeHead(401);
               res.end(JSON.stringify({ error: 'Unauthorized' }));
               return;
          }
          const session = sessions.get(token);
          session.lastAccess = new Date().toISOString();
          res.writeHead(200);
          res.end(JSON.stringify({
               message: 'This is a protected resource',
               username: session.username,
               timestamp: new Date().toISOString()
          }));
          return;
     }

     // Handle other requests
     res.writeHead(200);
     res.end(JSON.stringify({
          message: 'Hello from Backend 3!',
          path: req.url,
          method: req.method,
          requestCount,
          timestamp: new Date().toISOString()
     }));
});

// Clean up expired sessions every minute
setInterval(() => {
     const now = Date.now();
     const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
     for (const [token, session] of sessions.entries()) {
          const lastAccess = new Date(session.lastAccess).getTime();
          if (now - lastAccess > SESSION_TIMEOUT) {
               sessions.delete(token);
          }
     }
}, 60 * 1000);

server.listen(9093, () => console.log('Backend 3 running on port 9093')); 