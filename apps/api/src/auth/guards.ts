import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { UserRole } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { IS_PUBLIC_KEY, ROLES_KEY } from "./decorators";

const ROLES = new Set<string>(Object.values(UserRole));

/**
 * Guard de autenticación global.
 * - Modo "local": valida nuestro JWT propio con Passport (estrategia 'jwt').
 * - Modo "supabase": valida el access token llamando a Supabase (auth.getUser),
 *   lo que funciona sin importar el algoritmo de firma (HS256 o asimétrico
 *   ES256/RS256 de los proyectos nuevos). El rol se lee de app_metadata.
 * Respeta @Public().
 */
interface AuthUserPayload {
  id: string;
  email: string;
  nombre: string;
  role: UserRole;
  mustChangePassword: boolean;
}

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  private supabase: SupabaseClient | null = null;
  private readonly provider: string;
  // Cache email → id de la tabla Usuario, para no upsertear en cada request.
  private readonly userIdCache = new Map<string, string>();
  // Cache token → usuario validado. Evita llamar a Supabase (auth.getUser) en
  // cada request: el panel dispara varias llamadas por pantalla y sin esto
  // cada una pagaba un viaje de red a Supabase Auth. TTL corto y bien por
  // debajo de la vida del token (1h); al refrescar el token cambia la clave.
  private readonly tokenCache = new Map<
    string,
    { user: AuthUserPayload; exp: number }
  >();
  private static readonly TOKEN_TTL_MS = 5 * 60 * 1000;
  private static readonly TOKEN_CACHE_MAX = 500;
  /**
   * Si la cuenta está bloqueada o dada de baja, por email.
   *
   * Se consulta en cada request, también cuando el token ya estaba validado:
   * bloquear a alguien tiene que echarlo del sistema, no esperar a que se le
   * venza el token (12 h en modo local, 1 h en Supabase). El TTL corto es el
   * precio: hasta medio minuto de margen, a cambio de no ir a la base en
   * cada llamada.
   */
  private readonly estadoCache = new Map<
    string,
    { bloqueada: boolean; activo: boolean; exp: number }
  >();
  private static readonly ESTADO_TTL_MS = 30 * 1000;

  constructor(
    private reflector: Reflector,
    private config: ConfigService,
    private prisma: PrismaService,
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

  /**
   * Corta el paso si la cuenta está bloqueada o dada de baja.
   *
   * Va acá y no en el login porque con Supabase Auth el login no pasa por la
   * API: sin esto, bloquear a alguien en el panel no tendría ningún efecto y
   * la persona seguiría trabajando con el token que ya tenía.
   */
  private async verificarEstado(email: string): Promise<void> {
    if (!email) return;
    const clave = email.toLowerCase();
    let estado = this.estadoCache.get(clave);
    if (!estado || estado.exp <= Date.now()) {
      const u = await this.prisma.usuario.findUnique({
        where: { email: clave },
        select: { activo: true, bloqueadaEn: true },
      });
      // Sin fila todavía (primer login con Supabase): la crea el flujo normal.
      estado = {
        bloqueada: !!u?.bloqueadaEn,
        activo: u?.activo ?? true,
        exp: Date.now() + JwtAuthGuard.ESTADO_TTL_MS,
      };
      this.estadoCache.set(clave, estado);
    }
    if (estado.bloqueada) {
      throw new ForbiddenException(
        "La cuenta está bloqueada. Pedile a un administrador que la desbloquee.",
      );
    }
    if (!estado.activo) {
      throw new ForbiddenException("La cuenta está dada de baja.");
    }
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

      // Cache-hit: el token ya fue validado hace poco; evitamos el round-trip.
      const cached = this.tokenCache.get(token);
      if (cached && cached.exp > Date.now()) {
        await this.verificarEstado(cached.user.email);
        req.user = cached.user;
        return true;
      }

      const { data, error } = await this.getSupabase().auth.getUser(token);
      if (error || !data.user) {
        this.tokenCache.delete(token);
        throw new UnauthorizedException("Token inválido");
      }

      const u = data.user;
      const email = u.email ?? `${u.id}@sinemail.local`;
      const roleRaw =
        (u.app_metadata as Record<string, unknown>)?.role ??
        (u.user_metadata as Record<string, unknown>)?.role;
      const role = ROLES.has(String(roleRaw))
        ? (roleRaw as UserRole)
        : UserRole.CAJERO;
      const nombre =
        (u.user_metadata?.nombre as string) ??
        (u.user_metadata?.full_name as string) ??
        u.email ??
        "Usuario";

      // Mapea la identidad de Supabase a un Usuario local (por email) para que
      // las claves foráneas (mozoId, openedById, eventos, etc.) sean válidas.
      let localId = this.userIdCache.get(email);
      if (!localId) {
        const dbUser = await this.prisma.usuario.upsert({
          where: { email },
          update: { nombre, role },
          create: { email, nombre, role, passwordHash: "" },
        });
        localId = dbUser.id;
        this.userIdCache.set(email, localId);
      }

      await this.verificarEstado(email);

      const mustChangePassword =
        (u.user_metadata as Record<string, unknown>)?.must_change_password === true;
      const payload: AuthUserPayload = { id: localId, email, nombre, role, mustChangePassword };
      req.user = payload;

      // Guarda en cache (con tope de tamaño para no crecer sin límite).
      if (this.tokenCache.size >= JwtAuthGuard.TOKEN_CACHE_MAX) {
        const oldest = this.tokenCache.keys().next().value;
        if (oldest) this.tokenCache.delete(oldest);
      }
      this.tokenCache.set(token, {
        user: payload,
        exp: Date.now() + JwtAuthGuard.TOKEN_TTL_MS,
      });
      return true;
    }

    const ok = (await super.canActivate(context)) as boolean;
    if (ok) {
      // El JWT propio dura 12 h: sin este chequeo, bloquear a alguien no lo
      // sacaría del sistema hasta el día siguiente.
      const req = context.switchToHttp().getRequest();
      await this.verificarEstado(String(req.user?.email ?? ""));
    }
    return ok;
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
    if (!user) throw new UnauthorizedException("Iniciá sesión para continuar.");
    if (required.includes(user.role)) return true;
    // El "Forbidden resource" de Nest no le dice nada a nadie. Este mensaje se
    // muestra tal cual en el panel, así que tiene que explicar el porqué.
    const quienes = required.join(" o ");
    throw new ForbiddenException(
      `Tu rol (${user.role}) no puede hacer esto. Lo puede hacer: ${quienes}.`,
    );
  }
}
