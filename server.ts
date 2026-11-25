import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createApiRouter } from './server/app.ts';
import { GoldMonitorDatabase } from './server/db.ts';
import { PushNotificationService } from './server/services/push.ts';
import { MarketScheduler } from './server/services/scheduler.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = express();
  app.set('trust proxy', 1);

  const db = new GoldMonitorDatabase();
  const pushService = new PushNotificationService(db);
  const scheduler = new MarketScheduler(db, pushService);

  app.use('/api', createApiRouter(db, scheduler, pushService));

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Iranian Gold Bubble Monitor server listening on http://0.0.0.0:${PORT}`);
  });

  // Start background data collection without blocking HTTP startup
  void scheduler.start();

  const shutdown = () => {
    scheduler.stop();
    db.close();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
