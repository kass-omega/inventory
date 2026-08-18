import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { RequestItemStatus } from '@prisma/client';
import { Permissions } from '../common/decorators/permissions/permissions.decorator';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';
import { ConfirmReceiptDto } from './dto/confirm-receipt.dto';
import { CreateRequestDto } from './dto/create-request.dto';
import { RequestsService } from './requests.service';

@Controller('requests')
export class RequestsController {
  constructor(private service: RequestsService) {}

  @Post()
  @Permissions('requests.create')
  createRequest(@Body() dto: CreateRequestDto, @Req() req: RequestWithUser) {
    return this.service.createRequest(dto, req.user);
  }

  @Get()
  findAll(@Query() query: any, @Req() req: RequestWithUser) {
    return this.service.findAll(query, req.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  // Endpoint for Owner to Approve/Reject individual items (shop→store)
  // or Store/Reject individual items (store→owner)
  @Patch(':id/items')
  @Permissions('requests.approve')
  updateItemStatuses(
    @Param('id', ParseIntPipe) id: number,
    @Body('items')
    items: {
      id: number;
      status: RequestItemStatus;
      quantityStored?: number;
      newBuyPrice?: number;
      newSellPrice?: number;
    }[],
  ) {
    return this.service.updateItemStatuses(id, items);
  }

  // Endpoint for Storekeeper to Dispatch specific quantities (shop→store only)
  @Post(':id/dispatch')
  @Permissions('requests.dispatch')
  dispatchItems(
    @Param('id', ParseIntPipe) id: number,
    @Body('items') items: { id: number; quantityDispatched: number }[],
    @Req() req: RequestWithUser,
  ) {
    return this.service.dispatchItems(id, items, req.user);
  }

  // Endpoint for the receiving party to confirm receipt of items
  @Post(':id/confirm-receipt')
  @Permissions('requests.confirm')
  confirmReceipt(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmReceiptDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.confirmReceipt(id, dto.items, req.user);
  }
}
