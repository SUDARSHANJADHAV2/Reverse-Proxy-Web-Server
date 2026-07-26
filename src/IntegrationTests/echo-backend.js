const http = require('http');
const server = http.createServer((req, res) => {
     res.end('Echo backend is alive!');
});
server.listen(5001, () => console.log('Echo backend running on 5001')); 