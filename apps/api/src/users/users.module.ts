import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient, type User } from "@supabase/supabase-js";
import * as bcrypt from "bcryptjs";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from "class-validator";
import { UserRole } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

class CreateUsuarioDto {
  @IsEmail() email!: string;
  @IsString() nombre!: string;
  @IsString() @MinLength(6) password!: string;
  @IsEnum(UserRole) role!: UserRole;
  /** Obliga a cambiar la contraseña en el primer login (default true). */
  @IsOptional() @IsBoolean() forceChange?: boolean;
  /** PIN de fichaje, opcional al crear: se puede asignar después. */
  @IsOptional()
  @Matches(/^\d{4,6}$/, { message: "El PIN debe tener entre 4 y 6 dígitos." })
  pin?: string;
}
class UpdateRoleDto {
  @IsEnum(UserRole) role!: UserRole;
}
class ResetPasswordDto {
  @IsString() @MinLength(6) password!: string;
}

interface UsuarioView {
  id: string;
  email: string;
  nombre: string;
  role: string;
  /** Id en la tabla local (para PIN/fichaje); en modo local coincide con id. */
  localId?: string;
  numeroEmpleado?: number;
  /** Sólo indica si tiene PIN definido; nunca se expone el hash. */
  pinHash?: boolean;
}

@Injectable()
export class UsersService {
  private supabase: SupabaseClient | null = null;
  private readonly provider: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.provider = config.get<string>("AUTH_PROVIDER", "local");
  }

  private sb(): SupabaseClient {
    if (this.supabase) return this.supabase;
    const url = this.config.get<string>("SUPABASE_URL");
    const key = this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    this.supabase = createClient(url, key, { auth: { persistSession: false } });
    return this.supabase;
  }

  /** Nombre a mostrar de una identidad de Supabase. */
  private nombreDe(u: User): string {
    return (
      (u.user_metadata?.nombre as string) ??
      (u.user_metadata?.full_name as string) ??
      u.email ??
      "Usuario"
    );
  }

  /** Rol de una identidad de Supabase, con CAJERO como piso seguro. */
  private roleDe(u: User): UserRole {
    const raw = String(
      (u.app_metadata as Record<string, unknown>)?.role ??
        (u.user_metadata as Record<string, unknown>)?.role ??
        "",
    );
    return (Object.values(UserRole) as string[]).includes(raw)
      ? (raw as UserRole)
      : UserRole.CAJERO;
  }

  /**
   * Crea o actualiza la ficha local del usuario.
   *
   * El número de empleado y el PIN de fichaje viven en la tabla local, no en
   * Supabase Auth. Sin esta fila el tablet no tiene con qué identificar a la
   * persona: no hay número que tipear y el PIN no se puede ni asignar.
   */
  private async asegurarLocal(
    email: string,
    nombre: string,
    role: UserRole,
    pin?: string,
  ) {
    const pinHash = pin ? { pinHash: await bcrypt.hash(pin, 10) } : {};
    const clave = email.toLowerCase();
    return this.prisma.usuario.upsert({
      where: { email: clave },
      update: { nombre, role, activo: true, ...pinHash },
      // passwordHash vacío: con Supabase Auth la contraseña no vive acá.
      create: { email: clave, nombre, role, passwordHash: "", ...pinHash },
    });
  }

  async list(): Promise<UsuarioView[]> {
    if (this.provider === "supabase") {
      const { data, error } = await this.sb().auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) throw error;
      // Los datos de fichaje (número y PIN) viven en la tabla local: se cruzan por email.
      let porEmail = await this.fichasPorEmail();

      // Repara los usuarios creados antes de que create() escribiera la ficha
      // local: quedaron sin número de empleado y no podían fichar. Se les crea
      // acá una sola vez; a partir de la segunda carga esto no hace nada.
      const sinFicha = data.users.filter(
        (u) => u.email && !porEmail.has(u.email.toLowerCase()),
      );
      if (sinFicha.length > 0) {
        for (const u of sinFicha) {
          await this.asegurarLocal(u.email!, this.nombreDe(u), this.roleDe(u));
        }
        porEmail = await this.fichasPorEmail();
      }

      return data.users
        .map((u) => {
          const local = porEmail.get((u.email ?? "").toLowerCase());
          return {
            id: u.id,
            email: u.email ?? "",
            nombre: this.nombreDe(u),
            role: this.roleDe(u),
            localId: local?.id,
            numeroEmpleado: local?.numeroEmpleado,
            pinHash: !!local?.pinHash,
          };
        })
        .sort((a, b) => (a.numeroEmpleado ?? 0) - (b.numeroEmpleado ?? 0));
    }
    const users = await this.prisma.usuario.findMany({
      orderBy: { numeroEmpleado: "asc" },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      nombre: u.nombre,
      role: u.role,
      localId: u.id,
      numeroEmpleado: u.numeroEmpleado,
      pinHash: !!u.pinHash,
    }));
  }

  /** Fichas locales indexadas por email en minúsculas. */
  private async fichasPorEmail() {
    const locales = await this.prisma.usuario.findMany();
    return new Map(locales.map((l) => [l.email.toLowerCase(), l]));
  }

  async create(dto: CreateUsuarioDto): Promise<UsuarioView> {
    if (this.provider === "supabase") {
      const { data, error } = await this.sb().auth.admin.createUser({
        email: dto.email,
        password: dto.password,
        email_confirm: true,
        app_metadata: { role: dto.role },
        user_metadata: {
          nombre: dto.nombre,
          role: dto.role,
          must_change_password: dto.forceChange ?? true,
        },
      });
      if (error) throw error;
      const auth = data.user!;
      // La ficha local se crea acá y no cuando la persona entra por primera
      // vez al panel: un mozo puede no entrar nunca al panel y aun así tiene
      // que poder fichar en el tablet desde el primer día.
      // Se usa el email que devuelve Supabase (ya normalizado), no el tipeado.
      const local = await this.asegurarLocal(
        auth.email ?? dto.email,
        dto.nombre,
        dto.role,
        dto.pin,
      );
      return {
        id: auth.id,
        email: auth.email ?? dto.email,
        nombre: dto.nombre,
        role: dto.role,
        localId: local.id,
        numeroEmpleado: local.numeroEmpleado,
        pinHash: !!local.pinHash,
      };
    }
    const u = await this.prisma.usuario.create({
      data: {
        email: dto.email,
        nombre: dto.nombre,
        role: dto.role,
        passwordHash: await bcrypt.hash(dto.password, 10),
        pinHash: dto.pin ? await bcrypt.hash(dto.pin, 10) : null,
      },
    });
    return {
      id: u.id,
      email: u.email,
      nombre: u.nombre,
      role: u.role,
      localId: u.id,
      numeroEmpleado: u.numeroEmpleado,
      pinHash: !!u.pinHash,
    };
  }

  async updateRole(id: string, role: UserRole): Promise<UsuarioView> {
    if (this.provider === "supabase") {
      const { data, error } = await this.sb().auth.admin.updateUserById(id, {
        app_metadata: { role },
        user_metadata: { role },
      });
      if (error) throw error;
      const u = data.user!;
      // Mantiene sincronizada la tabla local (si el usuario ya existe).
      await this.prisma.usuario.updateMany({ where: { email: u.email ?? "" }, data: { role } });
      return { id: u.id, email: u.email ?? "", nombre: (u.user_metadata?.nombre as string) ?? "", role };
    }
    const u = await this.prisma.usuario.update({ where: { id }, data: { role } });
    return { id: u.id, email: u.email, nombre: u.nombre, role: u.role };
  }

  /** Resetea la contraseña y obliga a cambiarla en el próximo login. */
  async resetPassword(id: string, password: string) {
    if (this.provider === "supabase") {
      const actual = await this.sb().auth.admin.getUserById(id);
      const meta = (actual.data.user?.user_metadata as Record<string, unknown>) ?? {};
      const { error } = await this.sb().auth.admin.updateUserById(id, {
        password,
        user_metadata: { ...meta, must_change_password: true },
      });
      if (error) throw error;
      return { ok: true };
    }
    await this.prisma.usuario.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    return { ok: true };
  }

  async remove(id: string) {
    if (this.provider === "supabase") {
      const actual = await this.sb().auth.admin.getUserById(id);
      const email = actual.data.user?.email;
      const { error } = await this.sb().auth.admin.deleteUser(id);
      if (error) throw error;
      // La ficha local no se borra: de ella cuelga el historial (turnos,
      // pedidos, arqueos de caja). Se desactiva y se le saca el PIN, porque
      // si no la persona seguiría fichando con su número aunque ya no exista
      // en Auth.
      if (email) {
        await this.prisma.usuario.updateMany({
          where: { email: { equals: email, mode: "insensitive" } },
          data: { activo: false, pinHash: null },
        });
      }
      return { ok: true };
    }
    await this.prisma.usuario.delete({ where: { id } });
    return { ok: true };
  }
}

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller("admin/usuarios")
class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() dto: CreateUsuarioDto) {
    return this.users.create(dto);
  }

  @Patch(":id/rol")
  updateRole(@Param("id") id: string, @Body() dto: UpdateRoleDto) {
    return this.users.updateRole(id, dto.role);
  }

  @Post(":id/reset-password")
  resetPassword(@Param("id") id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(id, dto.password);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.users.remove(id);
  }
}

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
