// Authentication module for ArchTrack
import './types.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const BCRYPT_ROUNDS = 12;

// Auto-generate JWT secret if not set
function getJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  // In dev, use a stable secret derived from a fixed seed so tokens survive restarts
  const devSecret = 'archtrack-dev-secret-change-in-production-' + crypto.createHash('sha256').update('archtrack').digest('hex');
  console.warn('WARNING: Using auto-generated JWT_SECRET. Set JWT_SECRET in .env for production.');
  return devSecret;
}

const JWT_SECRET = getJwtSecret();

// Token expiry
const DASHBOARD_TOKEN_EXPIRY = '24h';
const DEVICE_TOKEN_EXPIRY = '90d';
const REFRESH_TOKEN_EXPIRY = '30d';

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT
export interface DashboardTokenPayload {
  userId: string;
  orgId: string;
  email: string;
  type: 'dashboard';
}

export interface DeviceTokenPayload {
  employeeId: string;
  orgId: string;
  type: 'device';
}

type TokenPayload = DashboardTokenPayload | DeviceTokenPayload;

export function generateDashboardToken(payload: Omit<DashboardTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'dashboard' }, JWT_SECRET, { expiresIn: DASHBOARD_TOKEN_EXPIRY });
}

export function generateDeviceToken(payload: Omit<DeviceTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'device' }, JWT_SECRET, { expiresIn: DEVICE_TOKEN_EXPIRY });
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function generateSetupToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Middleware: require dashboard auth
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    if (payload.type === 'dashboard') {
      req.orgId = payload.orgId;
      req.userId = payload.userId;
      req.tokenType = 'dashboard';
    } else if (payload.type === 'device') {
      req.orgId = payload.orgId;
      req.employeeId = payload.employeeId;
      req.tokenType = 'device';
    }

    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

// Middleware: require device auth (desktop tracker)
export function requireDeviceAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Device authentication required' });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    req.orgId = payload.orgId;
    req.tokenType = payload.type;

    if (payload.type === 'device') {
      req.employeeId = payload.employeeId;
    } else if (payload.type === 'dashboard') {
      req.userId = payload.userId;
    }

    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'Invalid or expired device token' });
  }
}

// Middleware: accept either dashboard or device auth
export function requireAnyAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    req.orgId = payload.orgId;
    req.tokenType = payload.type;

    if (payload.type === 'dashboard') {
      req.userId = payload.userId;
    } else if (payload.type === 'device') {
      req.employeeId = payload.employeeId;
    }

    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}
