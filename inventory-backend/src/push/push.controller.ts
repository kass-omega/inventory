import { Body, Controller, Post, Req } from '@nestjs/common';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly svc: PushService) {}

  @Post('subscribe')
  subscribe(@Req() req: RequestWithUser, @Body() body: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return this.svc.subscribe(req.user.sub, body);
  }
}