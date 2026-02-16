/**
 * Unit Tests for Helper Functions
 */

const {
  generateOrderNumber,
  generateVerificationToken,
  generateResetToken,
  generatePromoCode,
  isValidAlgerianPhone,
  isValidCIBCard,
  isValidEdahabiaCard,
  sanitizeSearchQuery,
  paginate,
  paginationResponse,
  maskEmail,
  slugify
} = require('../../utils/helpers');

describe('Helper Functions', () => {
  describe('generateOrderNumber', () => {
    it('should generate order number with correct format', () => {
      const orderNumber = generateOrderNumber();
      expect(orderNumber).toMatch(/^EAT-\d{8}-[A-F0-9]{4}$/);
    });

    it('should generate unique order numbers', () => {
      const orders = new Set();
      for (let i = 0; i < 100; i++) {
        orders.add(generateOrderNumber());
      }
      expect(orders.size).toBe(100);
    });
  });

  describe('generateVerificationToken', () => {
    it('should generate 64 character hex token', () => {
      const token = generateVerificationToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate unique tokens', () => {
      const token1 = generateVerificationToken();
      const token2 = generateVerificationToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('generateResetToken', () => {
    it('should generate 64 character hex token', () => {
      const token = generateResetToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('generatePromoCode', () => {
    it('should generate 8 character code by default', () => {
      const code = generatePromoCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[A-Z0-9]{8}$/);
    });

    it('should generate code with specified length', () => {
      const code = generatePromoCode(12);
      expect(code).toHaveLength(12);
    });
  });

  describe('isValidAlgerianPhone', () => {
    it('should validate correct Algerian phone numbers', () => {
      expect(isValidAlgerianPhone('0550123456')).toBe(true);
      expect(isValidAlgerianPhone('0660123456')).toBe(true);
      expect(isValidAlgerianPhone('0770123456')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(isValidAlgerianPhone('0450123456')).toBe(false); // Invalid prefix
      expect(isValidAlgerianPhone('055012345')).toBe(false);  // Too short
      expect(isValidAlgerianPhone('05501234567')).toBe(false); // Too long
      expect(isValidAlgerianPhone('1550123456')).toBe(false);  // Doesn't start with 0
    });

    it('should handle phone with spaces', () => {
      expect(isValidAlgerianPhone('0550 123 456')).toBe(true);
    });
  });

  describe('isValidCIBCard', () => {
    it('should validate correct CIB card numbers', () => {
      expect(isValidCIBCard('6000000000000000000')).toBe(true);
      expect(isValidCIBCard('6999999999999999999')).toBe(true);
    });

    it('should reject invalid CIB card numbers', () => {
      expect(isValidCIBCard('5000000000000000000')).toBe(false); // Doesn't start with 6
      expect(isValidCIBCard('600000000000000000')).toBe(false);  // 18 digits
      expect(isValidCIBCard('60000000000000000000')).toBe(false); // 20 digits
    });

    it('should handle card number with spaces', () => {
      expect(isValidCIBCard('6000 0000 0000 0000 000')).toBe(true);
    });
  });

  describe('isValidEdahabiaCard', () => {
    it('should validate correct EDAHABIA card numbers', () => {
      expect(isValidEdahabiaCard('1234567890123456')).toBe(true);
    });

    it('should reject invalid EDAHABIA card numbers', () => {
      expect(isValidEdahabiaCard('123456789012345')).toBe(false);  // 15 digits
      expect(isValidEdahabiaCard('12345678901234567')).toBe(false); // 17 digits
    });
  });

  describe('sanitizeSearchQuery', () => {
    it('should trim and lowercase query', () => {
      expect(sanitizeSearchQuery('  TEST  ')).toBe('test');
    });

    it('should remove special characters', () => {
      expect(sanitizeSearchQuery('test@#$%')).toBe('test');
    });

    it('should keep Arabic characters', () => {
      const result = sanitizeSearchQuery('طعام');
      expect(result).toBe('طعام');
    });
  });

  describe('paginate', () => {
    it('should return correct pagination values', () => {
      const result = paginate(2, 10);
      expect(result).toEqual({
        limit: 10,
        offset: 10,
        page: 2
      });
    });

    it('should use default values', () => {
      const result = paginate();
      expect(result).toEqual({
        limit: 12,
        offset: 0,
        page: 1
      });
    });

    it('should cap limit at 50', () => {
      const result = paginate(1, 100);
      expect(result.limit).toBe(50);
    });

    it('should ensure page is at least 1', () => {
      const result = paginate(0, 10);
      expect(result.page).toBe(1);
      expect(result.offset).toBe(0);
    });
  });

  describe('paginationResponse', () => {
    it('should return correct pagination response', () => {
      const result = paginationResponse(['item1', 'item2'], 10, 1, 5);
      expect(result).toEqual({
        data: ['item1', 'item2'],
        pagination: {
          total: 10,
          page: 1,
          limit: 5,
          totalPages: 2,
          hasNext: true,
          hasPrev: false
        }
      });
    });

    it('should correctly calculate hasNext and hasPrev', () => {
      const result = paginationResponse([], 10, 2, 5);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(true);
    });
  });

  describe('maskEmail', () => {
    it('should mask email correctly', () => {
      expect(maskEmail('test@example.com')).toBe('t**t@example.com');
      expect(maskEmail('john.doe@test.com')).toBe('j******e@test.com');
    });
  });

  describe('slugify', () => {
    it('should convert text to slug', () => {
      expect(slugify('Hello World')).toBe('hello-world');
      expect(slugify('Test  Multiple   Spaces')).toBe('test-multiple-spaces');
    });

    it('should remove special characters', () => {
      expect(slugify('Hello@World!')).toBe('helloworld');
    });

    it('should trim dashes', () => {
      expect(slugify('-Hello World-')).toBe('hello-world');
    });
  });
});
