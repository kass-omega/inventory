import { IsNumber, IsObject, IsString, IsOptional, IsInt } from 'class-validator';

export class CreateProductDto {
  @IsString()
  brand: string;

  @IsString()
  baseName: string;

  @IsObject()
  attributes: Record<string, any>;

  @IsNumber()
  currentBuyPrice: number;

  @IsNumber()
  currentSellPrice: number;

  @IsNumber()
  categoryId: number;

  @IsOptional()
  @IsInt()
  unitId?: number;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsInt()
  storeId?: number;
}
