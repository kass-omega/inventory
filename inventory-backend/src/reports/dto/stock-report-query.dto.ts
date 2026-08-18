import { IsOptional, IsString } from 'class-validator';

export class StockReportQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;
}
