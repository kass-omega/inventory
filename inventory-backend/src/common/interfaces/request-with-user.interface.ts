import { JwtPayload } from './jwt-payload.interface';

export class RequestWithUser {
  user!: JwtPayload;
}
