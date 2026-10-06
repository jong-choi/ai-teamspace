import { Controller, Get } from '@nestjs/common';

import { AppService } from '@/app.service';

import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

@AllowAnonymous()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
