import { Controller, Get, Post, Body } from '@nestjs/common';
import { UnitsService } from './units.service';

@Controller('units')
export class UnitsController {
  constructor(private readonly svc: UnitsService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Post()
  create(@Body('name') name: string) {
    return this.svc.create(name);
  }
}