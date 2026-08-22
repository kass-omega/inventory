import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { JwtAuthGuard } from './common/guards/jwt-auth/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions/permissions.guard';
import { CsrfGuard } from './common/guards/csrf/csrf.guard';
import { CreditPaymentsModule } from './credit-payments/credit-payments.module';
import { CreditSalesModule } from './credit-sales/credit-sales.module';
import { CustomersModule } from './customers/customers.module';
import { PurchasesModule } from './purchases/purchases.module';
import { LocationsModule } from './locations/locations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PriceHistoryModule } from './price-history/price-history.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { PushModule } from './push/push.module';
import { ReportsModule } from './reports/reports.module';
import { TasksModule } from './tasks/tasks.module';
import { RequestsModule } from './requests/requests.module';
import { RestockModule } from './restock/restock.module';
import { RolesModule } from './roles/roles.module';
import { SalesModule } from './sales/sales.module';
import { UnitsModule } from './units/units.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    CategoriesModule,
    LocationsModule,
    ProductsModule,
    RequestsModule,
    SalesModule,
    ReportsModule,
    UsersModule,
    RolesModule,
    PriceHistoryModule,
    RestockModule,
    NotificationsModule,
    PaymentMethodsModule,
    PurchasesModule,
    CustomersModule,
    CreditSalesModule,
    CreditPaymentsModule,
    UnitsModule,
    PushModule,
    TasksModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
