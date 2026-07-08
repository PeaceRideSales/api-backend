import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Security headers ─────────────────────────────────────────────────────
  app.use(helmet.default());

  // ── Response compression ─────────────────────────────────────────────────
  app.use(compression());

  // ── Global prefix ────────────────────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ── Global input validation ──────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // strip unknown fields
      forbidNonWhitelisted: true, // reject unknown fields with 400
      transform: true,           // auto-transform types (e.g. string -> number)
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ── CORS ─────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: [
      process.env.MINI_APP_URL || 'http://localhost:5173',
      process.env.ADMIN_URL || 'http://localhost:5174',
      // Allow Telegram WebApp origin
      'https://web.telegram.org',
      'https://peaceridesales.vercel.app',
      'https://peace-ride-sales-admin.vercel.app',
    ],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Peace Ride API running on port ${port}`);
}
bootstrap();
