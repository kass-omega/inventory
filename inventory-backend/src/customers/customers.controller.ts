import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly svc: CustomersService) {}

  @Get()
  findAll(@Query('shopId') shopId?: string) {
    return this.svc.findAll(shopId ? +shopId : undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query('shopId') shopId?: string) {
    return this.svc.findOne(+id, shopId ? +shopId : undefined);
  }

  @Post()
  create(@Body() body: { name: string; phone?: string; shopId: number }) {
    return this.svc.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; phone?: string }) {
    return this.svc.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(+id);
  }
}
