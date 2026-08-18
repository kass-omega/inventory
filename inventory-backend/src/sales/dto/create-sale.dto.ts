import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateSaleItemDto {
  @IsInt()
  productId!: number;

  @IsNumber()
  quantity!: number;

  @IsOptional()
  @IsNumber()
  customPrice?: number;
}

export class CreateSaleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];

  @IsOptional()
  @IsNumber()
  paidAmount?: number;

  @IsOptional()
  @IsNumber()
  remainingAmount?: number;

  @IsOptional()
  @IsString()
  @IsIn(['FULLY_PAID', 'PARTIALLY_PAID', 'CREDITED'])
  saleType?: string;

  @IsOptional()
  @IsInt()
  paymentMethodId?: number;

  @IsOptional()
  @IsInt()
  customerId?: number;

  @IsOptional()
  @IsInt()
  shopId?: number;

  @IsOptional()
  notes?: string;
}
