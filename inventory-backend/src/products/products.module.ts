import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [NotificationsModule],
  providers: [ProductsService],
  controllers: [ProductsController],
})
export class ProductsModule {}
