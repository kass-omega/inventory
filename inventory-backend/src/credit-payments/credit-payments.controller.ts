import { Controller, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { CreditPaymentsService } from './credit-payments.service';
import {
  CreateCreditPaymentDto,
  UpdateCreditPaymentDto,
} from './dto/credit-payment.dto';

@Controller('credit-payments')
export class CreditPaymentsController {
  constructor(private readonly svc: CreditPaymentsService) {}

  @Post()
  create(@Body() body: CreateCreditPaymentDto) {
    return this.svc.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdateCreditPaymentDto) {
    return this.svc.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(+id);
  }
}