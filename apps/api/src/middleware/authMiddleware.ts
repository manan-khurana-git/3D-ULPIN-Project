import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { authConfig } from "../config/auth.js";

export type AuthUser = {
  id: string;
  email: string;
  role: string;
};

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      status: "error",
      message: "Authentication token required",
    });
  }

  const token = authorization.substring("Bearer ".length).trim();

  try {
    const decoded = jwt.verify(
      token,
      authConfig.jwtSecret
    ) as jwt.JwtPayload;

    if (
      typeof decoded.sub !== "string" ||
      typeof decoded.email !== "string" ||
      typeof decoded.role !== "string"
    ) {
      return res.status(401).json({
        status: "error",
        message: "Invalid authentication token",
      });
    }

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch {
    return res.status(401).json({
      status: "error",
      message: "Invalid or expired authentication token",
    });
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: "error",
        message: "You do not have permission to access this resource",
      });
    }

    next();
  };
}