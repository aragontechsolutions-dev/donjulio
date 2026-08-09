import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth/decorators";

@Controller()
export class HealthController {
  @Public()
  @Get("health")
  health() {
    return { status: "ok", service: "donjulio-api", ts: new Date().toISOString() };
  }
}
