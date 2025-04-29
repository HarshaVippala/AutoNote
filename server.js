// server.js
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = false; // Ensure we run in production mode
const hostname = 'localhost';
// Let the system assign a port (0), or use a specific one if needed later (dev server usually defaults to 3000)
const port = process.env.PORT || 0;

// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  server.listen(port, (err) => {
    if (err) throw err;
    // Log the actual port the server is listening on
    const address = server.address();
    const actualPort = typeof address === 'string' ? address : address?.port;
    console.log(`> Ready on http://${hostname}:${actualPort}`);
    // Log port to stdout for the Swift app to potentially capture (though not used now)
    // console.log(`SERVER_LISTENING_PORT=${actualPort}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });

}).catch(err => {
    console.error("Error preparing Next.js app:", err);
    process.exit(1);
});