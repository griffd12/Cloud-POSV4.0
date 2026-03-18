/**
 * Authentication Middleware for Service Host
 * 
 * Validates workstation tokens using the service host's registration token.
 * All workstations on the same property share the service host's registration token.
 */

import { Request, Response, NextFunction } from 'express';
import { Database } from '../db/database.js';

export interface AuthenticatedRequest extends Request {
  workstationId?: string;
  propertyId?: string;
}

export function createAuthMiddleware(db: Database) {
  const serviceHostToken = process.env.SERVICE_HOST_TOKEN || '';
  const serviceHostPropertyId = process.env.SERVICE_HOST_PROPERTY_ID || '';

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const workstationToken = req.headers['x-workstation-token'] as string;
    
    let token: string | undefined;
    
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (workstationToken) {
      token = workstationToken;
    }
    
    if (req.path === '/health' || req.path === '/health/ready' || req.path.startsWith('/caps/sync/')) {
      return next();
    }

    const clientIp = req.ip || req.socket?.remoteAddress || '';
    const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1' || clientIp === 'localhost';
    if (isLocalhost) {
      return next();
    }
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (serviceHostToken && token === serviceHostToken) {
      req.propertyId = serviceHostPropertyId;
      const wsId = req.headers['x-workstation-id'] as string;
      if (wsId) req.workstationId = wsId;
      return next();
    }
    
    return res.status(401).json({ error: 'Invalid workstation token' });
  };
}

export function createPropertyScopeMiddleware() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.propertyId) {
      req.query.propertyId = req.propertyId;
    }
    next();
  };
}
