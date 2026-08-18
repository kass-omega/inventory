import { Controller, Post, Get, Delete, Body, Param } from '@nestjs/common';
import { CreditSalesService } from './credit-sales.service';
import { CreateCreditSaleDto } from './dto/create-credit-sale.dto';

@Controller('credit-sales')
export class CreditSalesController {
  constructor(private readonly svc: CreditSalesService) {}

  @Post()
  create(@Body() body: CreateCreditSaleDto) {
    return this.svc.create(body);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(+id);
  }
}