import { Body, Controller, Get, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsEmail, IsNotEmpty, IsString } from "class-validator";
import { AuthUser } from "@donjulio/shared";
import { AuthService } from "./auth.service";
import { CurrentUser, Public } from "./decorators";

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  // Fuerza bruta por IP. En el local todos entran desde la misma conexión,
  // así que un tope de 5 por minuto significaba que un empleado que se
  // equivocaba dejaba al resto sin poder entrar por un minuto —incluido el
  // admin que iba a desbloquearlo—. Diez deja trabajar y sigue frenando a
  // quien pruebe contraseñas, que además ahora choca con el bloqueo por
  // cuenta a los 5 intentos.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  /** Devuelve el usuario del JWT (para hidratar la sesión en el panel). */
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
