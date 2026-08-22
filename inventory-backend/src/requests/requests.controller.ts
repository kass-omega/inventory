import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { RequestItemStatus } from '@prisma/client';
import { Permissions } from '../common/decorators/permissions/permissions.decorator';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';
import { ConfirmReceiptDto } from './dto/confirm-receipt.dto';
import { ConfirmSaleDto } from './dto/confirm-sale.dto';
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

  // Owner or request creator edits a request that hasn't started dispatching.
  @Put(':id')
  @Permissions('requests.create')
  editRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateRequestDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.editRequest(id, dto, req.user);
  }

  // Dispatching store sends the request back to the creator for re-arranging
  // quantities when it can't fulfil them before dispatch.
  @Post(':id/send-back')
  @Permissions('requests.create')
  sendBack(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ) {
    return this.service.sendBack(id, req.user);
  }

  // Owner or request creator deletes a request that hasn't started dispatching.
  @Delete(':id')
  @Permissions('requests.create')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ) {
    return this.service.remove(id, req.user);
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
    @Req() req: RequestWithUser,
  ) {
    return this.service.updateItemStatuses(id, items, req.user);
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

  // Shopkeeper: confirm receipt AND sell the goods directly to a customer
  // (creates a sale linked to the request).
  @Post(':id/confirm-sale')
  @Permissions('requests.confirm', 'sales.create')
  confirmReceiptAndSell(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmSaleDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.confirmReceiptAndSell(id, dto, req.user);
  }

  // Explicitly close a request before it is fully fulfilled (accepted
  // shortage / make-good not needed).
  @Post(':id/close')
  @Permissions('requests.confirm', 'requests.approve')
  closeRequest(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ) {
    return this.service.closeRequest(id, req.user);
  }
}
