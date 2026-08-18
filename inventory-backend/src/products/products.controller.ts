import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions/permissions.decorator';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private service: ProductsService) {}

  @Post()
  @Permissions('products.create')
  create(@Body() dto: CreateProductDto, @Req() req: RequestWithUser) {
    return this.service.create(dto, req.user);
  }

  @Get()
  @Permissions('products.view')
  findAll(
    @Req() req: RequestWithUser,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.service.findAll(req.user, search, categoryId, locationId ? +locationId : undefined);
  }

  @Get(':id')
  @Permissions('products.view')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.service.findOne(id, req.user);
  }

  @Put(':id')
  @Permissions('products.edit')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('products.delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(':id/adjust-stock')
  @Permissions('products.adjust-stock')
  adjustStock(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustStockDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.adjustStock(id, dto, req.user);
  }
}
