import { createServer } from 'vite';
// Own the Vite instance directly so teardown does not depend on Windows taskkill.
export default async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 4173, strictPort: true } });
  await server.listen();
  return async () => { await server.close(); };
};
