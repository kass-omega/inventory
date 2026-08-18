import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [NotificationsModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
