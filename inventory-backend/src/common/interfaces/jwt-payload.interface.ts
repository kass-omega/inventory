import { LocationType } from '@prisma/client';

export interface JwtPayload {
  sub: number;
  email: string;
  roleId: number | null;
  roleName: string | null;
  isSuperuser: boolean;
  permissions: string[];
  locationId: number | null;
  locationType: LocationType | null;
}
