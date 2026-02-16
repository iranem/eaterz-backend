/**
 * Unit Tests for Validation Middleware
 */

const { validationResult } = require('express-validator');
const {
  validate,
  emailRules,
  passwordRules,
  phoneRules,
  idParamRules,
  paginationRules,
  priceRules,
  ratingRules
} = require('../../middleware/validationMiddleware');

// Mock Express request/response
const mockRequest = (body = {}, params = {}, query = {}) => ({
  body,
  params,
  query
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = () => jest.fn();

// Helper to run validation
const runValidation = async (rules, req) => {
  for (const rule of Array.isArray(rules) ? rules : [rules]) {
    await rule.run(req);
  }
  return validationResult(req);
};

describe('Validation Middleware', () => {
  describe('validate middleware', () => {
    it('should call next() when no validation errors', () => {
      const req = mockRequest();
      req.validationErrors = () => [];
      const res = mockResponse();
      const next = mockNext();

      // Mock empty validation result
      jest.spyOn(require('express-validator'), 'validationResult')
        .mockReturnValue({ isEmpty: () => true, array: () => [] });

      validate(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return 400 with errors when validation fails', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      jest.spyOn(require('express-validator'), 'validationResult')
        .mockReturnValue({
          isEmpty: () => false,
          array: () => [{ path: 'email', msg: 'Email invalide' }]
        });

      validate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Erreurs de validation',
        errors: [{ field: 'email', message: 'Email invalide' }]
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('emailRules', () => {
    it('should validate correct email', async () => {
      const req = mockRequest({ email: 'test@example.com' });
      const result = await runValidation(emailRules, req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should reject invalid email', async () => {
      const req = mockRequest({ email: 'invalid-email' });
      const result = await runValidation(emailRules, req);
      expect(result.isEmpty()).toBe(false);
    });

    it('should normalize email', async () => {
      const req = mockRequest({ email: '  TEST@EXAMPLE.COM  ' });
      await runValidation(emailRules, req);
      expect(req.body.email).toBe('test@example.com');
    });
  });

  describe('passwordRules', () => {
    it('should validate strong password', async () => {
      const req = mockRequest({ password: 'Test@123' });
      const result = await runValidation(passwordRules, req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should reject weak password', async () => {
      const req = mockRequest({ password: 'weak' });
      const result = await runValidation(passwordRules, req);
      expect(result.isEmpty()).toBe(false);
    });

    it('should require uppercase', async () => {
      const req = mockRequest({ password: 'test@123' });
      const result = await runValidation(passwordRules, req);
      expect(result.isEmpty()).toBe(false);
    });

    it('should require lowercase', async () => {
      const req = mockRequest({ password: 'TEST@123' });
      const result = await runValidation(passwordRules, req);
      expect(result.isEmpty()).toBe(false);
    });

    it('should require digit', async () => {
      const req = mockRequest({ password: 'Test@abc' });
      const result = await runValidation(passwordRules, req);
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('phoneRules', () => {
    it('should validate Algerian phone number', async () => {
      const req = mockRequest({ telephone: '0550123456' });
      const result = await runValidation(phoneRules, req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should allow empty phone (optional)', async () => {
      const req = mockRequest({ telephone: undefined });
      const result = await runValidation(phoneRules, req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should reject invalid phone', async () => {
      const req = mockRequest({ telephone: '0123456789' });
      const result = await runValidation(phoneRules, req);
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('idParamRules', () => {
    it('should validate positive integer ID', async () => {
      const req = mockRequest({}, { id: '1' });
      const result = await runValidation(idParamRules, req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should reject non-integer ID', async () => {
      const req = mockRequest({}, { id: 'abc' });
      const result = await runValidation(idParamRules, req);
      expect(result.isEmpty()).toBe(false);
    });

    it('should reject zero ID', async () => {
      const req = mockRequest({}, { id: '0' });
      const result = await runValidation(idParamRules, req);
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('paginationRules', () => {
    it('should validate correct pagination', async () => {
      const req = mockRequest({}, {}, { page: '1', limit: '10' });
      const result = await runValidation(paginationRules, req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should allow empty pagination (optional)', async () => {
      const req = mockRequest({}, {}, {});
      const result = await runValidation(paginationRules, req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should reject limit over 50', async () => {
      const req = mockRequest({}, {}, { limit: '100' });
      const result = await runValidation(paginationRules, req);
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('priceRules', () => {
    it('should validate positive price', async () => {
      const req = mockRequest({ prix: '100.50' });
      const result = await runValidation(priceRules, req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should reject negative price', async () => {
      const req = mockRequest({ prix: '-10' });
      const result = await runValidation(priceRules, req);
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('ratingRules', () => {
    it('should validate rating between 1 and 5', async () => {
      for (let i = 1; i <= 5; i++) {
        const req = mockRequest({ note: String(i) });
        const result = await runValidation(ratingRules, req);
        expect(result.isEmpty()).toBe(true);
      }
    });

    it('should reject rating outside range', async () => {
      const req1 = mockRequest({ note: '0' });
      const req2 = mockRequest({ note: '6' });
      
      const result1 = await runValidation(ratingRules, req1);
      const result2 = await runValidation(ratingRules, req2);
      
      expect(result1.isEmpty()).toBe(false);
      expect(result2.isEmpty()).toBe(false);
    });
  });
});
