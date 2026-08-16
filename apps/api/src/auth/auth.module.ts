import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";

/**
 * Secreto de firma del JWT propio. En producción es obligatorio: un valor por
 * defecto permitiría a cualquiera firmar tokens válidos.
 */
function requireJwtSecret(config: ConfigService): string {
  const secret = config.get<string>("JWT_SECRET");
  if (secret && secret.length >= 16) return secret;
  const provider = config.get<string>("AUTH_PROVIDER", "local");
  const esProd = process.env.NODE_ENV === "production";
  // En modo supabase la app no firma tokens propios: el valor no se usa.
  if (esProd && provider !== "supabase") {
    throw new Error(
      "JWT_SECRET no está configurado (o es demasiado corto). Definí uno de al menos 16 caracteres.",
    );
  }
  return secret || "dev-secret-solo-desarrollo";
}

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: requireJwtSecret(config),
        signOptions: {
          expiresIn: config.get<string>("JWT_EXPIRES_IN", "12h"),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
