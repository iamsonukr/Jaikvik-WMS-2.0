import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

export type ObjectIdInput = string | Types.ObjectId;

export function toObjectId(value: ObjectIdInput, fieldName = 'id'): Types.ObjectId {
  if (value instanceof Types.ObjectId) return value;
  const id = String(value || '');
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestException(`A valid ${fieldName} is required.`);
  }
  return new Types.ObjectId(id);
}

export function optionalObjectId(value: ObjectIdInput | null | undefined, fieldName = 'id'): Types.ObjectId | null {
  if (value == null || value === '') return null;
  return toObjectId(value, fieldName);
}

export function legacyObjectIdFilter(fieldName: string, value: ObjectIdInput) {
  const objectId = toObjectId(value, fieldName);
  return {
    $or: [
      { [fieldName]: objectId },
      { [fieldName]: String(objectId) },
    ],
  };
}

export function whatsappAccountIdFilter(value: ObjectIdInput) {
  const objectId = toObjectId(value, 'whatsappAccountId');
  return {
    $or: [
      { whatsappAccountId: objectId },
      { whatsappAccountId: String(objectId) },
      { clientId: objectId },
      { clientId: String(objectId) },
    ],
  };
}

export function resolveWhatsAppAccountId(
  value: { whatsappAccountId?: ObjectIdInput; clientId?: ObjectIdInput } | ObjectIdInput,
): ObjectIdInput {
  if (typeof value === 'object' && value !== null && !(value instanceof Types.ObjectId)) {
    return value.whatsappAccountId || value.clientId;
  }
  return value as ObjectIdInput;
}
