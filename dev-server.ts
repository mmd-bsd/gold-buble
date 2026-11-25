import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import marketHandler from './api/market.ts';

const PORT = Number(process.env.PORT || 3000);

async function bootstrap() {
  const app = express();

  // Same handler Vercel runs as a serverless function, mounted for local dev.
  app.all('/api/market', (req, res) => {
    void marketHandler(req, res);
  });

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Gold bubble monitor dev server listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start dev server:', err);
  process.exit(1);
});
