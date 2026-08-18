import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [NotificationsModule],
  providers: [RequestsService],
  controllers: [RequestsController],
})
export class RequestsModule {}
