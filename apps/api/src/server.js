const { createApp } = require('./app');

const app = createApp();
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer from 1 to 65535.');
}

const server = app.listen(port, () => {
  console.log(`Rord Mai API listening on http://localhost:${port}`);
});

server.on('error', (error) => {
  console.error(`HTTP server failed: ${error.code ?? error.message}`);
  process.exitCode = 1;
});

const shutdown = () => {
  server.close((error) => {
    if (error) process.exitCode = 1;
  });
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
