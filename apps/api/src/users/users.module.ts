import {
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
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as bcrypt from "bcryptjs";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
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

  async list(): Promise<UsuarioView[]> {
    if (this.provider === "supabase") {
      const { data, error } = await this.sb().auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) throw error;
      // Los datos de fichaje (número y PIN) viven en la tabla local: se cruzan por email.
      const locales = await this.prisma.usuario.findMany();
      const porEmail = new Map(locales.map((l) => [l.email.toLowerCase(), l]));
      return data.users.map((u) => {
        const local = porEmail.get((u.email ?? "").toLowerCase());
        return {
          id: u.id,
          email: u.email ?? "",
          nombre: (u.user_metadata?.nombre as string) ?? u.email ?? "",
          role: (u.app_metadata?.role as string) ?? "CAJERO",
          localId: local?.id,
          numeroEmpleado: local?.numeroEmpleado,
          pinHash: !!local?.pinHash,
        };
      });
    }
    const users = await this.prisma.usuario.findMany({ orderBy: { nombre: "asc" } });
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
      return { id: data.user!.id, email: dto.email, nombre: dto.nombre, role: dto.role };
    }
    const u = await this.prisma.usuario.create({
      data: {
        email: dto.email,
        nombre: dto.nombre,
        role: dto.role,
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
    });
    return { id: u.id, email: u.email, nombre: u.nombre, role: u.role };
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
      const { error } = await this.sb().auth.admin.deleteUser(id);
      if (error) throw error;
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
