/**
 * Integration Tests for Authentication Routes
 */

const request = require('supertest');
const { app } = require('../../server');
const { User } = require('../../models');

describe('Auth Routes', () => {
  describe('POST /api/auth/register', () => {
    const validUser = {
      email: 'newuser@test.com',
      password: 'Test@123',
      nom: 'Doe',
      prenom: 'John',
      telephone: '0550123456'
    };

    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe(validUser.email);
      expect(res.body.data.user.password).toBeUndefined(); // Password should not be returned
      
      // Should set HttpOnly cookies
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject duplicate email', async () => {
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send(validUser);

      // Duplicate registration
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, email: 'invalid-email' });

      expect(res.statusCode).toBe(400);
    });

    it('should reject weak password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, password: 'weak' });

      expect(res.statusCode).toBe(400);
    });

    it('should register prestataire with establishment name', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          ...validUser,
          email: 'prestataire@test.com',
          role: 'prestataire',
          nomEtablissement: 'Test Restaurant'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.user.role).toBe('prestataire');
      expect(res.body.data.user.nomEtablissement).toBe('Test Restaurant');
    });
  });

  describe('POST /api/auth/login', () => {
    const testUser = {
      email: 'login@test.com',
      password: 'Test@123',
      nom: 'Test',
      prenom: 'User'
    };

    beforeEach(async () => {
      await global.factories.createUser(testUser);
    });

    it('should login with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword@123'
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: testUser.password
        });

      expect(res.statusCode).toBe(401);
    });

    it('should reject inactive user', async () => {
      await User.update({ isActive: false }, { where: { email: testUser.email } });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user with valid token', async () => {
      const user = await global.factories.createUser();
      const authHeader = global.authHelpers.getAuthHeader(user);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', authHeader);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(user.id);
    });

    it('should reject request without token', async () => {
      const res = await request(app)
        .get('/api/auth/me');

      expect(res.statusCode).toBe(401);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const user = await global.factories.createUser();
      const authHeader = global.authHelpers.getAuthHeader(user);

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', authHeader);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should invalidate token version on logout', async () => {
      const user = await global.factories.createUser();
      const authHeader = global.authHelpers.getAuthHeader(user);

      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', authHeader);

      // Refresh user from database
      await user.reload();
      expect(user.tokenVersion).toBe(1);
    });
  });

  describe('POST /api/auth/refresh-token', () => {
    it('should refresh access token with valid refresh token', async () => {
      const user = await global.factories.createUser();
      const tokens = global.authHelpers.getAuthTokens(user);

      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: tokens.refreshToken });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('should reject invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: 'invalid-refresh-token' });

      expect(res.statusCode).toBe(401);
    });

    it('should reject revoked refresh token', async () => {
      const user = await global.factories.createUser();
      const tokens = global.authHelpers.getAuthTokens(user);

      // Increment token version (revoke all tokens)
      await user.update({ tokenVersion: user.tokenVersion + 1 });

      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: tokens.refreshToken });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should return success even for non-existent email (prevent enumeration)', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@test.com' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should set reset token for existing user', async () => {
      const user = await global.factories.createUser({ email: 'reset@test.com' });

      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: user.email });

      await user.reload();
      expect(user.resetPasswordToken).toBeDefined();
      expect(user.resetPasswordExpires).toBeDefined();
    });
  });

  describe('GET /api/auth/csrf-token', () => {
    it('should return CSRF token', async () => {
      const res = await request(app)
        .get('/api/auth/csrf-token');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.csrfToken).toBeDefined();
    });
  });
});
