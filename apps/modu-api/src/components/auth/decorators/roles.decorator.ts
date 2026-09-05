import { SetMetadata } from '@nestjs/common';

/** Must be listed above `@UseGuards(RolesGuard)`. */
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
