const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');

// Configuration
const CONFIG = {
     host: 'localhost',
     port: 8027,
     concurrentUsers: 100,       // High concurrent load to stress test
     requestsPerUser: 20,        // More requests per user to test caching
     delayBetweenRequests: 10,   // Small delay to prevent overwhelming
     timeoutMs: 30000,          // Increased timeout for high load
     retryAttempts: 2,          // Fewer retries to see real failures
     retryDelay: 500,           // Shorter retry delay
     collectBackendStats: true   // Track which backend handles requests
};

// Test scenarios
const scenarios = [
     // Basic HTTP Methods Test
     {
          name: 'Basic GET',
          method: 'GET',
          path: '/api/test'
     },
     {
          name: 'Basic POST',
          method: 'POST',
          path: '/api/test',
          body: { data: 'test data' }
     },
     {
          name: 'Basic PUT',
          method: 'PUT',
          path: '/api/test/123',
          body: { data: 'updated data' }
     },
     {
          name: 'Basic DELETE',
          method: 'DELETE',
          path: '/api/test/123'
     },

     // Load Distribution Test
     {
          name: 'Quick Request',
          method: 'GET',
          path: '/api/quick'
     },
     {
          name: 'Heavy Request',
          method: 'GET',
          path: '/api/heavy'
     },

     // Cache Testing
     {
          name: 'Static HTML',
          method: 'GET',
          path: '/static/index.html'
     },
     {
          name: 'Static Image',
          method: 'GET',
          path: '/static/test.jpg'
     },

  
];

// Statistics tracking
const stats = new Map();
scenarios.forEach(scenario => {
     stats.set(scenario.name, {
          total: 0,
          success: 0,
          failed: 0,
          totalTime: 0,
          minTime: Infinity,
          maxTime: 0,
          backend1Count: 0,  // Track requests handled by backend1
          backend2Count: 0,  // Track requests handled by backend2
          cacheHits: 0,     // Track cache hits
          cacheMisses: 0    // Track cache misses
     });
});

// Helper function to make HTTP request with retry
async function makeRequest(scenario, token = null, attempt = 1) {
     const makeAttempt = () => new Promise((resolve, reject) => {
          const startTime = performance.now();

          const options = {
               host: CONFIG.host,
               port: CONFIG.port,
               path: scenario.path,
               method: scenario.method,
               headers: {
                    'Content-Type': 'application/json',
                    ...scenario.headers
               },
               timeout: CONFIG.timeoutMs
          };

          // Add authorization if token is provided
          if (token && scenario.headers?.Authorization) {
               options.headers.Authorization = `Bearer ${token}`;
          }

          const req = http.request(options, (res) => {
               let data = '';
               res.on('data', chunk => data += chunk);
               res.on('end', () => {
                    const endTime = performance.now();
                    const duration = endTime - startTime;

                    // Update statistics
                    const scenarioStats = stats.get(scenario.name);
                    scenarioStats.total++;
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                         scenarioStats.success++;
                    } else {
                         scenarioStats.failed++;
                    }
                    scenarioStats.totalTime += duration;
                    scenarioStats.minTime = Math.min(scenarioStats.minTime, duration);
                    scenarioStats.maxTime = Math.max(scenarioStats.maxTime, duration);

                    // Track which backend handled the request
                    const backend = res.headers['x-backend'];
                    if (backend === 'backend1') scenarioStats.backend1Count++;
                    if (backend === 'backend2') scenarioStats.backend2Count++;
                    
                    // Track cache hits/misses
                    const cacheStatus = res.headers['x-cache'];
                    if (cacheStatus === 'HIT') scenarioStats.cacheHits++;
                    if (cacheStatus === 'MISS') scenarioStats.cacheMisses++;

                    // Parse JSON safely
                    let parsedData = null;
                    if (data) {
                         try {
                              parsedData = JSON.parse(data);
                         } catch (e) {
                              // Not JSON, keep as string
                              parsedData = data;
                         }
                    }

                    resolve({
                         statusCode: res.statusCode,
                         data: parsedData,
                         duration
                    });
               });
          });

          req.on('error', (error) => {
               const endTime = performance.now();
               const duration = endTime - startTime;

               // Update statistics
               const scenarioStats = stats.get(scenario.name);
               scenarioStats.total++;
               scenarioStats.failed++;
               scenarioStats.totalTime += duration;
               scenarioStats.minTime = Math.min(scenarioStats.minTime, duration);
               scenarioStats.maxTime = Math.max(scenarioStats.maxTime, duration);

               reject(error);
          });

          if (scenario.body) {
               req.write(JSON.stringify(scenario.body));
          }
          req.end();
     });
     
     try {
          return await makeAttempt();
     } catch (error) {
          if (attempt < CONFIG.retryAttempts && 
              (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED')) {
               // Wait before retrying
               await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
               return makeRequest(scenario, token, attempt + 1);
          }
          throw error;
     }
}

// Run a single user's test sequence
async function runUserSequence(userId) {
     try {
          // Run each scenario multiple times to test caching and load balancing
          for (const scenario of scenarios) {
               // Add a small random delay between requests to simulate real traffic patterns
               const jitter = Math.random() * 50; // 0-50ms random jitter
               await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenRequests + jitter));
               
               // Add custom headers to track request distribution
               const customScenario = {
                    ...scenario,
                    headers: {
                         'X-Test-User-Id': userId.toString(),
                         'X-Test-Timestamp': Date.now().toString(),
                         'X-Test-Run': Math.random().toString() // Help identify unique requests
                    }
               };
               
               await makeRequest(customScenario);
          }
     } catch (error) {
          console.error(`Error in user sequence ${userId}:`, error.message);
     }
}

// Rate limiting helper
async function rateLimiter(fn, batchSize = 5, delayMs = 1000) {
    const queue = [];
    let running = 0;
    
    return new Promise((resolve, reject) => {
        const processQueue = async () => {
            while (queue.length && running < batchSize) {
                const next = queue.shift();
                running++;
                try {
                    await next();
                } catch (error) {
                    console.error('Error in batch:', error);
                }
                running--;
            }
            
            if (queue.length === 0 && running === 0) {
                resolve();
            } else if (queue.length > 0) {
                setTimeout(processQueue, delayMs);
            }
        };
        
        fn(task => {
            queue.push(task);
            processQueue();
        });
    });
}

// Main load test function
async function runLoadTest() {
     console.log(`Starting load test with ${CONFIG.concurrentUsers} concurrent users`);
     console.log(`Each user will make ${CONFIG.requestsPerUser} requests per scenario`);
     console.log(`Retry attempts: ${CONFIG.retryAttempts}, Delay between requests: ${CONFIG.delayBetweenRequests}ms`);

     const startTime = performance.now();

     // Create array of user sequences
     const userSequences = Array.from({ length: CONFIG.concurrentUsers }, (_, i) => {
          return Array.from({ length: CONFIG.requestsPerUser }, () => runUserSequence(i));
     }).flat();

     // Run all sequences concurrently
     await Promise.allSettled(userSequences);

     const endTime = performance.now();
     const totalDuration = (endTime - startTime) / 1000; // Convert to seconds

     // Print results
     console.log('\nLoad Test Results:');
     console.log('==================');
     console.log(`Total Duration: ${totalDuration.toFixed(2)} seconds`);
     console.log(`Total Users: ${CONFIG.concurrentUsers}`);
     console.log(`Requests per User: ${CONFIG.requestsPerUser}`);
     console.log('\nScenario Results:');
     console.log('================');

     for (const [name, data] of stats.entries()) {
          if (data.total === 0) continue;

          console.log(`\n${name}:`);
          console.log(`  Total Requests: ${data.total}`);
          console.log(`  Successful: ${data.success} (${((data.success / data.total) * 100).toFixed(2)}%)`);
          console.log(`  Failed: ${data.failed} (${((data.failed / data.total) * 100).toFixed(2)}%)`);
          console.log(`  Timing:`);
          console.log(`    Average: ${(data.totalTime / data.total).toFixed(2)}ms`);
          console.log(`    Min: ${data.minTime.toFixed(2)}ms`);
          console.log(`    Max: ${data.maxTime.toFixed(2)}ms`);
          console.log(`    Requests/sec: ${(data.total / totalDuration).toFixed(2)}`);
          
          // Show load balancing stats if any requests went to the backends
          if (data.backend1Count || data.backend2Count) {
               console.log(`  Load Distribution:`);
               console.log(`    Backend1: ${data.backend1Count} (${((data.backend1Count / data.total) * 100).toFixed(2)}%)`);
               console.log(`    Backend2: ${data.backend2Count} (${((data.backend2Count / data.total) * 100).toFixed(2)}%)`);
          }
          
          // Show cache stats for cacheable endpoints
          if (data.cacheHits || data.cacheMisses) {
               console.log(`  Cache Performance:`);
               console.log(`    Cache Hits: ${data.cacheHits} (${((data.cacheHits / data.total) * 100).toFixed(2)}%)`);
               console.log(`    Cache Misses: ${data.cacheMisses} (${((data.cacheMisses / data.total) * 100).toFixed(2)}%)`);
          }
     }
}

// Run the load test
runLoadTest()
     .then(() => {
          console.log('Load test complete');
          process.exitCode = 0;
     })
     .catch((err) => {
          console.error(err);
          process.exitCode = 1;
     });