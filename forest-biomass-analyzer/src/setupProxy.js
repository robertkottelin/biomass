const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy authentication requests to Copernicus identity service
  app.use(
    '/api/auth',
    createProxyMiddleware({
      target: 'https://identity.dataspace.copernicus.eu',
      changeOrigin: true,
      pathRewrite: { '^/api/auth': '' },
    })
  );

  // Proxy data requests to Sentinel Hub
  app.use(
    '/api/copernicus',
    createProxyMiddleware({
      target: 'https://sh.dataspace.copernicus.eu',
      changeOrigin: true,
      pathRewrite: { '^/api/copernicus': '' },
    })
  );
};
