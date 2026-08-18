import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCreditPaymentDto {
  @IsInt()
  customerId!: number;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  paymentMethodId?: number;
}

export class UpdateCreditPaymentDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  paymentMethodId?: number;

  @IsOptional()
  @IsString()
  paidAt?: string;
}
