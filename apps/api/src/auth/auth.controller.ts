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
  // Fuerza bruta: 5 intentos de login por minuto e IP.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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
