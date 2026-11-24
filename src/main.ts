
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';

import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Enable Helmet security headers
  app.use(helmet());

  // 2. Set global API prefix
  app.setGlobalPrefix('api');

  // 3. Enable global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // 4. Start server
  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
