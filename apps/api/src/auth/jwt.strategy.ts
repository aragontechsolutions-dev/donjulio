import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthUser, UserRole } from "@donjulio/shared";

/** Payload de nuestro JWT local. */
interface LocalPayload {
  sub: string;
  email: string;
  nombre: string;
  role: UserRole;
}

/** Payload relevante de un JWT de Supabase (HS256). */
interface SupabasePayload {
  sub: string;
  email?: string;
  app_metadata?: { role?: string };
  user_metadata?: { role?: string; nombre?: string; full_name?: string };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly provider: string;

  constructor(config: ConfigService) {
    const provider = config.get<string>("AUTH_PROVIDER", "local");
    // En modo supabase la validación real la hace el guard (auth.getUser); esta
    // estrategia no se usa, pero passport exige un secreto no vacío para iniciar.
    const secret =
      provider === "supabase"
        ? config.get<string>("SUPABASE_JWT_SECRET") ||
          config.get<string>("JWT_SECRET") ||
          "supabase-mode-unused"
        : config.get<string>("JWT_SECRET") || "dev-secret-solo-desarrollo";
    if (
      provider !== "supabase" &&
      process.env.NODE_ENV === "production" &&
      (!config.get<string>("JWT_SECRET") || (config.get<string>("JWT_SECRET") ?? "").length < 16)
    ) {
      throw new Error("JWT_SECRET no está configurado en producción.");
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
    this.provider = provider;
  }

  /** El valor retornado se adjunta a request.user. */
  async validate(payload: LocalPayload & SupabasePayload): Promise<AuthUser> {
    if (this.provider === "supabase") {
      // El rol de la app viaja en app_metadata.role (seteado con la service key).
      const role =
        (payload.app_metadata?.role as UserRole) ??
        (payload.user_metadata?.role as UserRole) ??
        UserRole.CAJERO;
      return {
        id: payload.sub,
        email: payload.email ?? "",
        nombre:
          payload.user_metadata?.nombre ??
          payload.user_metadata?.full_name ??
          payload.email ??
          "Usuario",
        role,
      };
    }
    return {
      id: payload.sub,
      email: payload.email,
      nombre: payload.nombre,
      role: payload.role,
    };
  }
}
