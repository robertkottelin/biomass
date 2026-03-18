const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // In development, proxy API requests to the Express backend server
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
    })
  );

  // Proxy blog routes to Express (server-rendered HTML)
  app.use(
    '/blog',
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
    })
  );
};
