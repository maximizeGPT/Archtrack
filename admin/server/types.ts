// Express Request augmentation for auth
declare global {
  namespace Express {
    interface Request {
      orgId?: string;
      userId?: string;
      employeeId?: string;
      tokenType?: 'dashboard' | 'device';
    }
  }
}

export {};
