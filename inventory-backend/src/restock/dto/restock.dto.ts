import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Min,
} from 'class-validator';

export class RestockDto {
  @IsInt()
  productId!: number;

  @IsInt()
  storeId!: number;

  @IsInt()
  @IsPositive()
  quantity!: number;

  // Prices are optional — the owner can restock without changing prices.
  @IsOptional()
  @IsNumber()
  @Min(0)
  newBuyPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  newSellPrice?: number;
}
