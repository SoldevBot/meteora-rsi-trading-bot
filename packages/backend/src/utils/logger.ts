import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Safe JSON stringify that handles circular references and limits depth
function safeStringify(obj: any, spaces?: number): string {
  const seen = new WeakSet();
  let depth = 0;
  const maxDepth = 2; // Limit to 2 levels deep
  
  const replacer = (key: string, value: any) => {
    depth++;
    
    if (depth > maxDepth) {
      depth--;
      return '[Object - Too Deep]';
    }
    
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        depth--;
        return '[Circular Reference]';
      }
      seen.add(value);
    }
    
    // Remove potentially problematic objects
    if (value && typeof value === 'object') {
      if (value.constructor && ['TLSSocket', 'HTTPParser', 'Socket', 'Server', 'IncomingMessage', 'ClientRequest'].includes(value.constructor.name)) {
        depth--;
        return `[${value.constructor.name} Object]`;
      }
      
      // Handle HTTP Response objects
      if (value.status || value.statusCode || value.headers) {
        depth--;
        return {
          status: value.status || value.statusCode,
          statusText: value.statusText || value.statusMessage,
          url: value.url,
          headers: '[Headers Object]'
        };
      }
      
      // Handle Error objects safely
      if (value.message && value.stack && value.name) {
        depth--;
        return {
          name: value.name,
          message: value.message,
          code: value.code
        };
      }
      
      // For large objects, show only keys
      if (Object.keys(value).length > 10) {
        depth--;
        return `[Object with ${Object.keys(value).length} keys: ${Object.keys(value).slice(0, 5).join(', ')}${Object.keys(value).length > 5 ? '...' : ''}]`;
      }
    }
    
    depth--;
    return value;
  };
  
  try {
    return JSON.stringify(obj, replacer, spaces);
  } catch (error: any) {
    return `[JSON Stringify Error: ${error?.message || 'Unknown error'}]`;
  }
}

const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug', // Change to debug for more detailed logs
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
      const metaStr = Object.keys(meta).length ? `\n${safeStringify(meta, 2)}` : '';
      return `[${timestamp}] ${level.toUpperCase().padEnd(5)} [${service}]: ${message}${metaStr}`;
    })
  ),
  defaultMeta: { service: 'meteora-trading-bot' },
  transports: [
    // Separate log files for different purposes
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'trading.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'debug.log'),
      level: 'debug',
      maxsize: 20971520, // 20MB
      maxFiles: 5,
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
  ],
});

// If we're not in production, log to the console as well
if (process.env.NODE_ENV !== 'production') {
  baseLogger.add(new winston.transports.Console({
    level: 'debug',
    format: winston.format.combine(
      winston.format.colorize({ all: true }),
      winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
      winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${safeStringify(meta)}` : '';
        return `[${timestamp}] ${level} [${service}]: ${message}${metaStr}`;
      })
    )
  }));
} else {
  // In production, still show important info on console
  baseLogger.add(new winston.transports.Console({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, service }) => {
        return `[${timestamp}] ${level.toUpperCase()} [${service}]: ${message}`;
      })
    )
  }));
}

// Export logger with additional helper methods for debugging
export const logger = Object.assign(baseLogger, {
  // Helper method for trading operations
  trading: (message: string, data?: any) => {
    baseLogger.info(`[TRADING] ${message}`, data);
  },
  
  // Helper method for position operations
  position: (message: string, data?: any) => {
    baseLogger.info(`[POSITION] ${message}`, data);
  },
  
  // Helper method for RPC operations
  rpc: (message: string, data?: any) => {
    baseLogger.info(`[RPC] ${message}`, data);
  },
  
  // Helper method for wallet operations
  wallet: (message: string, data?: any) => {
    baseLogger.info(`[WALLET] ${message}`, data);
  },
  
  // Helper method for API operations
  api: (message: string, data?: any) => {
    baseLogger.info(`[API] ${message}`, data);
  },
  
  // Helper method for scheduler operations
  scheduler: (message: string, data?: any) => {
    baseLogger.info(`[SCHEDULER] ${message}`, data);
  },
  
  // Helper method for performance tracking
  performance: (operation: string, duration: number, data?: any) => {
    baseLogger.info(`[PERFORMANCE] ${operation} completed in ${duration}ms`, data);
  },
  
  // Helper method for errors with context
  errorWithContext: (message: string, error: any, context?: any) => {
    baseLogger.error(message, {
      error: error?.message || error,
      stack: error?.stack,
      context
    });
  }
});
