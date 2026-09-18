import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

const mockPrisma = {
  user: { findUnique: jest.fn(), create: jest.fn() },
  group: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  groupMember: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
  expense: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  expenseShare: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
  settlement: { findMany: jest.fn(), create: jest.fn() },
  activity: { create: jest.fn() },
  refreshToken: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockUsersService = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
  search: jest.fn(),
};

const mockJwtService = {
  signAsync: jest.fn(),
  verifyAsync: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      JWT_ACCESS_SECRET: 'access-secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
      ACCESS_TOKEN_EXPIRES_IN: '15m',
      REFRESH_TOKEN_EXPIRES_IN: '7d',
    };
    return config[key];
  }),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should create user, hash password, and return tokens', async () => {
      const user = {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@test.com',
        passwordHash: 'hashed-pw',
        createdAt: new Date(),
      };

      mockUsersService.findByEmail.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
      mockPrisma.user.create.mockResolvedValue(user);
      mockJwtService.signAsync.mockResolvedValue('jwt-token');
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.register('Alice', 'alice@test.com', 'password123');

      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user.name).toBe('Alice');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
    });

    it('should throw ConflictException for duplicate email', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register('Alice', 'existing@test.com', 'password123'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should validate credentials and return tokens', async () => {
      const user = {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@test.com',
        passwordHash: 'hashed-pw',
        createdAt: new Date(),
      };

      mockUsersService.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.signAsync.mockResolvedValue('jwt-token');
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login('alice@test.com', 'password123');

      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const user = {
        id: 'user-1',
        email: 'alice@test.com',
        passwordHash: 'hashed-pw',
      };

      mockUsersService.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login('alice@test.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login('nobody@test.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    it('should validate old token, rotate, and return new pair', async () => {
      const storedToken = {
        id: 'token-1',
        userId: 'user-1',
        tokenHash: 'hashed-token',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
      };

      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-token');
      mockPrisma.refreshToken.findFirst.mockResolvedValue(storedToken);
      mockPrisma.refreshToken.update.mockResolvedValue({});
      mockJwtService.signAsync.mockResolvedValue('new-jwt-token');
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refreshTokens('user-1', 'old-refresh-token');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'token-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-token');
      mockPrisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(
        service.refreshTokens('user-1', 'invalid-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should revoke refresh token', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-token');
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.logout('user-1', 'refresh-token');

      expect(result.message).toBe('Logged out successfully');
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          tokenHash: 'hashed-token',
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
