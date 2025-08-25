import { Request, Response } from 'express';
import { logger } from '../utils/logger';

interface LoginAttempt {
  ip: string;
  timestamp: number;
  attempts: number;
}

class AuthController {
  private loginAttempts: Map<string, LoginAttempt> = new Map();
  private readonly maxAttempts = 5;
  private readonly windowMs = 5 * 60 * 1000; // 5 minutes
  private readonly frontendPassword = process.env.FRONTEND_PASSWORD || 'meteorabot2025';

  verifyPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const { password } = req.body;
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

      // Check rate limiting
      const attempt = this.loginAttempts.get(clientIp);
      const now = Date.now();

      if (attempt) {
        // Reset attempts if window has passed
        if (now - attempt.timestamp > this.windowMs) {
          this.loginAttempts.delete(clientIp);
        } else if (attempt.attempts >= this.maxAttempts) {
          const remainingTime = Math.ceil((this.windowMs - (now - attempt.timestamp)) / 1000 / 60);
          logger.warn(`Rate limit exceeded for IP ${clientIp}`, {
            attempts: attempt.attempts,
            remainingTime: `${remainingTime} minutes`
          });
          
          res.status(429).json({
            success: false,
            message: `Too many failed attempts. Please wait ${remainingTime} minutes.`,
            remainingTime
          });
          return;
        }
      }

      if (!password) {
        res.status(400).json({
          success: false,
          message: 'Password is required'
        });
        return;
      }

      // Verify password
      const isValid = password === this.frontendPassword;

      if (isValid) {
        // Clear attempts on successful login
        this.loginAttempts.delete(clientIp);
        
        logger.info(`Successful frontend login from IP ${clientIp}`);
        
        res.json({
          success: true,
          message: 'Login successful'
        });
      } else {
        // Track failed attempt
        const currentAttempt = this.loginAttempts.get(clientIp);
        if (currentAttempt) {
          currentAttempt.attempts += 1;
          currentAttempt.timestamp = now;
        } else {
          this.loginAttempts.set(clientIp, {
            ip: clientIp,
            timestamp: now,
            attempts: 1
          });
        }

        const newAttempt = this.loginAttempts.get(clientIp)!;
        const remainingAttempts = this.maxAttempts - newAttempt.attempts;

        logger.warn(`Failed frontend login attempt from IP ${clientIp}`, {
          attempts: newAttempt.attempts,
          remainingAttempts
        });

        res.status(401).json({
          success: false,
          message: `Invalid password. ${remainingAttempts} attempts remaining.`,
          remainingAttempts: Math.max(0, remainingAttempts)
        });
      }
    } catch (error) {
      logger.error('Auth verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };

  // Cleanup old attempts periodically
  cleanupOldAttempts = (): void => {
    const now = Date.now();
    for (const [ip, attempt] of this.loginAttempts.entries()) {
      if (now - attempt.timestamp > this.windowMs) {
        this.loginAttempts.delete(ip);
      }
    }
  };

  constructor() {
    // Cleanup every 10 minutes
    setInterval(this.cleanupOldAttempts, 10 * 60 * 1000);
  }
}

export const authController = new AuthController();
