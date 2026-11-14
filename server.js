// Tiny static file server (no dependencies):  node server.js  ->  http://localhost:8080
const http = require('http'), fs = require('fs'), path = require('path');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const root = __dirname, port = process.env.PORT || 8080;
http.createServer((req, res) => {
  const file = path.normalize(path.join(root, decodeURIComponent(req.url.split('?')[0])));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  const target = fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file, 'index.html') : file;
  fs.readFile(target, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`Sunset Bay running at http://localhost:${port}`));
