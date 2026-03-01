/**
 * Authentication Middleware for Service Host
 * 
 * Validates workstation tokens and ensures proper property scoping.
 */

import { Request, Response, NextFunction } from 'express';
import { Database } from '../db/database.js';

export interface AuthenticatedRequest extends Request {
  workstationId?: string;
  propertyId?: string;
}

export function createAuthMiddleware(db: Database) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const workstationToken = req.headers['x-workstation-token'] as string;
    
    // Extract token from header
    let token: string | undefined;
    
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (workstationToken) {
      token = workstationToken;
    }
    
    if (req.path === '/health') {
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
    
    // Validate token against registered workstations
    const workstation = db.get<{
      id: string;
      property_id: string;
      name: string;
    }>(
      'SELECT id, property_id, name FROM workstations WHERE token = ?',
      [token]
    );
    
    if (!workstation) {
      return res.status(401).json({ error: 'Invalid workstation token' });
    }
    
    // Attach workstation info to request
    req.workstationId = workstation.id;
    req.propertyId = workstation.property_id;
    
    next();
  };
}

export function createPropertyScopeMiddleware() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Ensure requests are scoped to the authenticated property
    if (req.propertyId) {
      // Add property filter to query if applicable
      req.query.propertyId = req.propertyId;
    }
    next();
  };
}
