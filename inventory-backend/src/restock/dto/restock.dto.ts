import { IsInt, IsNumber, IsPositive, Min } from 'class-validator';

export class RestockDto {
  @IsInt()
  productId!: number;

  @IsInt()
  storeId!: number;

  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsNumber()
  @Min(0)
  newBuyPrice!: number;

  @IsNumber()
  @Min(0)
  newSellPrice!: number;
}
