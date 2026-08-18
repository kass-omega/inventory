import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Put,
  Req,
} from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions/permissions.decorator';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';
import {
  ResetPasswordDto,
  UpdateUserStatusDto,
  UserDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('users')
@Permissions('users.manage')
export class UsersController {
  constructor(private service: UsersService) {}

  @Get()
  @Permissions('users.view', 'users.manage')
  findAll() {
    return this.service.findAll();
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UserDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Put(':id/password')
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ResetPasswordDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.resetPassword(id, body.password, req.user);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserStatusDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.updateStatus(id, body.status, req.user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ) {
    return this.service.remove(id, req.user);
  }
}
