import crypto from 'crypto';
import { createLogger } from '../utils/logger';
import type { EncryptedData } from '../types/mcp';

const logger = createLogger('TokenEncryption');

class TokenEncryptionService {
  private masterKey: Buffer;
  private algorithm = 'aes-256-gcm';

  constructor(masterKeyHex: string) {
    this.masterKey = Buffer.from(masterKeyHex, 'hex');
    
    if (this.masterKey.length !== 32) {
      throw new Error('Master key must be 32 bytes (64 hex characters)');
    }
  }

  encrypt(plaintext: string): EncryptedData {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv) as crypto.CipherGCM;

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    logger.debug('Token encrypted');

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  decrypt(encryptedData: EncryptedData): string {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.masterKey,
      Buffer.from(encryptedData.iv, 'hex')
    ) as crypto.DecipherGCM;

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    logger.debug('Token decrypted');

    return decrypted;
  }

  encryptToken(token: any): string {
    const plaintext = JSON.stringify(token);
    const encrypted = this.encrypt(plaintext);
    return JSON.stringify(encrypted);
  }

  decryptToken(encryptedString: string): any {
    const encrypted = JSON.parse(encryptedString) as EncryptedData;
    const plaintext = this.decrypt(encrypted);
    return JSON.parse(plaintext);
  }
}

export function createEncryptionService(masterKey: string): TokenEncryptionService {
  return new TokenEncryptionService(masterKey);
}
