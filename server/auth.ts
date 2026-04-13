import { createChildLogger } from './logger';
import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import type { User as DbUser, UserRole } from "@shared/schema";

const logger = createChildLogger('Auth');

declare global {
  namespace Express {
    interface User {
      claims?: {
        sub: string;
        email?: string;
        first_name?: string;
        last_name?: string;
      };
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
    }
    interface Request {
      dbUser?: DbUser;
      impersonatedCustomerId?: string;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Check passport session first (new Replit Auth OIDC)
    if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user) {
        req.dbUser = user;
        
        const impersonateCustomerId = req.headers["x-impersonate-customer"] as string;
        if (impersonateCustomerId && user.role === "super_admin") {
          req.impersonatedCustomerId = impersonateCustomerId;
        }
      }
      return next();
    }
    
    // Check for email/password session login (userId stored in session)
    const sessionUserId = req.session?.userId;
    if (sessionUserId) {
      const user = await storage.getUser(sessionUserId);
      if (user && user.isActive) {
        req.dbUser = user;
        
        const impersonateCustomerId = req.headers["x-impersonate-customer"] as string;
        if (impersonateCustomerId && user.role === "super_admin") {
          req.impersonatedCustomerId = impersonateCustomerId;
        }
        return next();
      }
    }
    
    if (process.env.NODE_ENV === "development" || process.env.REPL_ID) {
      const userId = req.headers["x-replit-user-id"] as string;
      const userEmail = req.headers["x-replit-user-name"] as string;
      
      if (!userId && !userEmail) {
        return next();
      }

      let user = await storage.getUser(userId);
      
      if (!user && userEmail) {
        user = await storage.getUserByEmail(userEmail);
      }
      
      if (user) {
        req.dbUser = user;
        
        const impersonateCustomerId = req.headers["x-impersonate-customer"] as string;
        if (impersonateCustomerId && user.role === "super_admin") {
          req.impersonatedCustomerId = impersonateCustomerId;
        }
      }
    }
    
    next();
  } catch (error) {
    logger.error({ err: error }, "Auth middleware error");
    next();
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.dbUser) {
    return res.status(401).json({ error: "Authentication required" });
  }
  // Prevent browser from caching authenticated responses
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
}

export function requireRole(...allowedRoles: (UserRole | UserRole[])[]) {
  // Flatten in case an array was passed as the first argument
  const flatRoles = allowedRoles.flat() as UserRole[];
  
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    if (!flatRoles.includes(req.dbUser.role as UserRole)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    
    next();
  };
}

export function requireCustomerAccess(paramName: string = "customerId") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const customerId = req.params[paramName] || req.query[paramName] || req.body?.[paramName];
    
    if (req.dbUser.role === "super_admin") {
      return next();
    }
    
    if (!req.dbUser.customerId) {
      return res.status(403).json({ error: "User not associated with any customer" });
    }
    
    if (customerId && req.dbUser.customerId !== customerId) {
      return res.status(403).json({ error: "Access denied: Cannot access other customer's data" });
    }
    
    next();
  };
}

export function isSuperAdmin(user: DbUser | undefined): boolean {
  return user?.role === "super_admin";
}

export function isAdmin(user: DbUser | undefined): boolean {
  return user?.role === "admin" || user?.role === "super_admin";
}

export function isManager(user: DbUser | undefined): boolean {
  return user?.role === "manager" || isAdmin(user);
}

export function canManageUsers(user: DbUser | undefined): boolean {
  return user?.role === "super_admin" || user?.role === "admin";
}

export function canAssignRole(assigner: DbUser | undefined, targetRole: UserRole): boolean {
  if (!assigner) return false;
  
  if (assigner.role === "super_admin") {
    return true;
  }
  
  if (assigner.role === "admin") {
    return targetRole !== "super_admin";
  }
  
  return false;
}

export function getEffectiveCustomerId(req: Request): string | null {
  if (!req.dbUser) return null;
  
  if (req.dbUser.role === "super_admin" && req.impersonatedCustomerId) {
    return req.impersonatedCustomerId;
  }
  
  return req.dbUser.customerId;
}
