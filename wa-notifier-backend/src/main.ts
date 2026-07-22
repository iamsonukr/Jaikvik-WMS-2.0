import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { requestLogger } from './common/request-logger.middleware';

function getCorsOrigins() {
  const raw = process.env.CORS_ORIGIN;
  if (!raw || raw.trim() === '*') return '*';

  return raw
    .split(',')
    .map(origin => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.setGlobalPrefix('api');
  app.use(requestLogger);

  // Allow frontend origin — set CORS_ORIGIN in .env
  app.enableCors({
    origin: getCorsOrigins(),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('Jaikvik WMS API')
    .setDescription('WhatsApp Business Platform — Backend API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = process.env.API_PORT || 3001;
  await app.listen(port);
  console.log(`\n🚀 Jaikvik WMS API running on http://localhost:${port}/api`);
  console.log(`📖 Swagger docs at   http://localhost:${port}/api/docs\n`);
}
bootstrap();
