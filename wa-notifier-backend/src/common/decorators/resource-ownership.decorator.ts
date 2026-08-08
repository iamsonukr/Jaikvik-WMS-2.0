import { SetMetadata } from '@nestjs/common';

export const RESOURCE_OWNERSHIP_KEY = 'resourceOwnership';

export interface ResourceOwnershipMetadata {
  collection: string;
  param?: string;
}

export const ResourceOwnership = (collection: string, param = 'id') =>
  SetMetadata(RESOURCE_OWNERSHIP_KEY, { collection, param } satisfies ResourceOwnershipMetadata);
