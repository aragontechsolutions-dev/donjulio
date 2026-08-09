import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  // rawBody: true es necesario para validar la firma de los webhooks de pago.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: config
      .get<string>("CORS_ORIGIN", "http://localhost:5173")
      .split(",")
      .map((s) => s.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = config.get<number>("API_PORT", 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🥖 Don Julio API escuchando en http://localhost:${port}/api`);
}

bootstrap();
