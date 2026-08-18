import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RestockController } from './restock.controller';
import { RestockService } from './restock.service';

@Module({
  imports: [NotificationsModule],
  providers: [RestockService],
  controllers: [RestockController],
})
export class RestockModule {}
