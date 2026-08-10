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
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { UserRole } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

class CreateUsuarioDto {
  @IsEmail() email!: string;
  @IsString() nombre!: string;
  @IsString() @MinLength(6) password!: string;
  @IsEnum(UserRole) role!: UserRole;
}
class UpdateRoleDto {
  @IsEnum(UserRole) role!: UserRole;
}

interface UsuarioView {
  id: string;
  email: string;
  nombre: string;
  role: string;
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
      return data.users.map((u) => ({
        id: u.id,
        email: u.email ?? "",
        nombre: (u.user_metadata?.nombre as string) ?? u.email ?? "",
        role: (u.app_metadata?.role as string) ?? "CAJERO",
      }));
    }
    const users = await this.prisma.usuario.findMany({ orderBy: { nombre: "asc" } });
    return users.map((u) => ({ id: u.id, email: u.email, nombre: u.nombre, role: u.role }));
  }

  async create(dto: CreateUsuarioDto): Promise<UsuarioView> {
    if (this.provider === "supabase") {
      const { data, error } = await this.sb().auth.admin.createUser({
        email: dto.email,
        password: dto.password,
        email_confirm: true,
        app_metadata: { role: dto.role },
        user_metadata: { nombre: dto.nombre, role: dto.role },
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
