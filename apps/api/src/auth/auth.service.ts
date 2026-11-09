import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { LoginResponse, UserRole } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";

/** Cuántas veces se puede errar la contraseña antes de bloquear la cuenta. */
export const MAX_INTENTOS = 5;

/**
 * Lo que ve quien tiene la cuenta bloqueada.
 *
 * Acá sí conviene decir qué pasó: la persona está parada en el mostrador y
 * necesita saber que no es la contraseña, que no sirve seguir probando, y a
 * quién pedirle que la destrabe.
 */
export const CUENTA_BLOQUEADA =
  "La cuenta está bloqueada por demasiados intentos fallidos. Pedile a un administrador que la desbloquee.";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.prisma.usuario.findUnique({ where: { email } });
    if (!user || !user.activo) {
      // Mismo mensaje que con la contraseña mal: si dijéramos "ese usuario no
      // existe", cualquiera podría averiguar qué correos tienen cuenta.
      throw new UnauthorizedException("Credenciales inválidas");
    }
    if (user.bloqueadaEn) {
      throw new ForbiddenException(CUENTA_BLOQUEADA);
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const intentos = user.intentosFallidos + 1;
      const seBloquea = intentos >= MAX_INTENTOS;
      await this.prisma.usuario.update({
        where: { id: user.id },
        data: {
          intentosFallidos: intentos,
          ...(seBloquea ? { bloqueadaEn: new Date() } : {}),
        },
      });
      if (seBloquea) throw new ForbiddenException(CUENTA_BLOQUEADA);
      const quedan = MAX_INTENTOS - intentos;
      // Se dice cuántos quedan a propósito: al que se equivocó de tecla le
      // evita quedar bloqueado sin enterarse, y al que está probando claves
      // no le sirve de nada, porque el bloqueo llega igual.
      throw new UnauthorizedException(
        `Credenciales inválidas. ${quedan === 1 ? "Queda 1 intento" : `Quedan ${quedan} intentos`} antes de que se bloquee la cuenta.`,
      );
    }

    // Entró bien: se perdona lo anterior.
    if (user.intentosFallidos > 0) {
      await this.prisma.usuario.update({
        where: { id: user.id },
        data: { intentosFallidos: 0 },
      });
    }

    const payload = {
      sub: user.id,
      email: user.email,
      nombre: user.nombre,
      role: user.role,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        role: user.role as UserRole,
      },
    };
  }

  static async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }
}
