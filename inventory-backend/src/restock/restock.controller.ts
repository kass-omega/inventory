import { Body, Controller, Post, Req } from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions/permissions.decorator';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';
import { RestockDto } from './dto/restock.dto';
import { RestockService } from './restock.service';

@Controller('restock')
export class RestockController {
  constructor(private service: RestockService) {}

  @Post()
  @Permissions('restock.create')
  restock(@Body() dto: RestockDto, @Req() req: RequestWithUser) {
    return this.service.restock(dto, req.user);
  }
}
