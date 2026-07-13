const http = require('http');
const { URL } = require('url');

const listenHost = process.env.LAN_PROXY_HOST || '0.0.0.0';
const listenPort = Number(process.env.LAN_PROXY_PORT || 5173);
const target = new URL(process.env.LAN_PROXY_TARGET || 'http://127.0.0.1:5174');

const server = http.createServer((clientReq, clientRes) => {
  const headers = { ...clientReq.headers, host: target.host };
  const proxyReq = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: clientReq.method,
      path: clientReq.url,
      headers,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(clientRes);
    },
  );

  proxyReq.on('error', (error) => {
    clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    clientRes.end(`LAN proxy could not reach ${target.href}: ${error.message}`);
  });

  clientReq.pipe(proxyReq);
});

server.listen(listenPort, listenHost, () => {
  console.log(`LAN proxy listening on http://${listenHost}:${listenPort}`);
  console.log(`Forwarding to ${target.href}`);
});
