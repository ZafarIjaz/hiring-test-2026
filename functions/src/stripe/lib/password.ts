import * as crypto from 'crypto';

export function randomTempPassword(): string {
  return `${crypto.randomBytes(24).toString('base64')}aA1!`;
}
