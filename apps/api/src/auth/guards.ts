import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { UserRole } from "@donjulio/shared";
import { IS_PUBLIC_KEY, ROLES_KEY } from "./decorators";

/**
 * Guard de autenticación global.
 * - Modo "local": valida nuestro JWT propio con Passport (estrategia 'jwt').
 * - Modo "supabase": valida el access token llamando a Supabase (auth.getUser),
 *   lo que funciona sin importar el algoritmo de firma (HS256 o asimétrico
 *   ES256/RS256 de los proyectos nuevos). El rol se lee de app_metadata.
 * Respeta @Public().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  private supabase: SupabaseClient | null = null;
  private readonly provider: string;

  constructor(
    private reflector: Reflector,
    private config: ConfigService,
  ) {
    super();
    this.provider = config.get<string>("AUTH_PROVIDER", "local");
  }

  private getSupabase(): SupabaseClient {
    if (this.supabase) return this.supabase;
    const url = this.config.get<string>("SUPABASE_URL");
    const key =
      this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY") ||
      this.config.get<string>("SUPABASE_ANON_KEY");
    if (!url || !key) {
      throw new Error(
        "AUTH_PROVIDER=supabase requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o ANON_KEY).",
      );
    }
    this.supabase = createClient(url, key, { auth: { persistSession: false } });
    return this.supabase;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    if (this.provider === "supabase") {
      const req = context.switchToHttp().getRequest();
      const header: string = req.headers["authorization"] ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) throw new UnauthorizedException("Falta el token");

      const { data, error } = await this.getSupabase().auth.getUser(token);
      if (error || !data.user) throw new UnauthorizedException("Token inválido");

      const u = data.user;
      const role =
        ((u.app_metadata as Record<string, unknown>)?.role as UserRole) ??
        ((u.user_metadata as Record<string, unknown>)?.role as UserRole) ??
        UserRole.CAJERO;
      req.user = {
        id: u.id,
        email: u.email ?? "",
        nombre:
          (u.user_metadata?.nombre as string) ??
          (u.user_metadata?.full_name as string) ??
          u.email ??
          "Usuario",
        role,
      };
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }
}

/** Guard de autorización por rol. Usar junto con @Roles(...). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest();
    return !!user && required.includes(user.role);
  }
}
