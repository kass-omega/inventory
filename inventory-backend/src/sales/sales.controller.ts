import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions/permissions.decorator';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ReturnSaleDto } from './dto/return-sale.dto';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(private service: SalesService) {}

  @Post()
  @Permissions('sales.create')
  createSale(@Body() dto: CreateSaleDto, @Req() req: RequestWithUser) {
    return this.service.createSale(dto, req.user);
  }

  @Get()
  @Permissions('sales.view')
  findAll(@Req() req: RequestWithUser) {
    return this.service.findAll(req.user);
  }

  @Get('returns')
  @Permissions('sales.return')
  findReturns(@Req() req: RequestWithUser) {
    return this.service.findReturns(req.user);
  }

  @Get(':id')
  @Permissions('sales.view')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.service.findOne(id, req.user);
  }

  @Post(':id/return')
  @Permissions('sales.return')
  returnSale(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReturnSaleDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.returnSale(id, dto, req.user);
  }

  @Put(':id')
  @Permissions('sales.edit')
  updateSale(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSaleDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.updateSale(id, dto, req.user);
  }

  @Delete(':id')
  @Permissions('sales.delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
