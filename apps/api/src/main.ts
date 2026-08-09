import { join } from "node:path";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap() {
  // rawBody: true es necesario para validar la firma de los webhooks de pago.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // Sirve las imágenes subidas en modo Storage "local" (en prod se usa Supabase).
  app.useStaticAssets(join(process.cwd(), "uploads"), { prefix: "/uploads/" });

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

  // Render/hosts inyectan PORT; en local usamos API_PORT (default 3000).
  const port = Number(process.env.PORT ?? config.get<number>("API_PORT", 3000));
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`🥖 Don Julio API escuchando en el puerto ${port} (prefijo /api)`);
}

bootstrap();
