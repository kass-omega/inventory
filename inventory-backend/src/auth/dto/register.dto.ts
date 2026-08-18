import {
  IsEmail,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { PASSWORD_MESSAGE, PASSWORD_RULE } from '../../common/validators/password';

export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @Length(8, 72)
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsInt()
  @IsPositive()
  roleId!: number;

  @IsInt()
  @IsPositive()
  @IsOptional()
  locationId?: number;
}
