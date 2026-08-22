import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SalesModule } from '../sales/sales.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [NotificationsModule, SalesModule],
  providers: [RequestsService],
  controllers: [RequestsController],
})
export class RequestsModule {}
