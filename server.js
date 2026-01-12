const http = require('http');

const server = http.createServer((req, res) => {
  // ここに処理を記述
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.write('<h1>Hello World</h1>');
    res.end();
});

const port = 8080;
server.listen(port);
console.log('Server listen on port ' + port);