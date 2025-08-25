import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { setupRoutes } from './routes';
import { TradingService } from './services/tradingService';
import { SchedulerService } from './services/schedulerService';
import { setTradingService } from './controllers/walletController';
import { setTradingService as setTradingServicePositions } from './controllers/positionsController';
import { setTradingService as setTradingServiceConfig } from './controllers/configController';
import { setServices } from './controllers/rsiController';
import { DataService } from './services/dataService';

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:4173']
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:4173', 'http://localhost:5173'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Connection reset endpoint for debugging network issues
app.post('/health/reset-connections', (req, res) => {
  try {
    if (!dataService) {
      return res.status(500).json({ 
        status: 'error', 
        message: 'DataService not initialized',
        timestamp: new Date().toISOString()
      });
    }
    
    dataService.resetConnections();
    res.json({ 
      status: 'success', 
      message: 'HTTP connections reset and caches cleared',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ 
      status: 'error', 
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Setup API routes
setupRoutes(app);

// Error handling middleware
app.use(errorHandler);

// Initialize services
let tradingService: TradingService;
let schedulerService: SchedulerService;
let dataService: DataService; // Make dataService global

const initializeServices = async () => {
  try {
    logger.info('Initializing trading services...');
    
    tradingService = new TradingService();
    await tradingService.initialize();
    
    // Initialize data service
    dataService = new DataService(); // Assign to global variable
    
    // Set services in controllers
    setTradingService(tradingService);
    setTradingServicePositions(tradingService);
    setTradingServiceConfig(tradingService);
    setServices(tradingService, dataService);
    
    // IMPORTANT: Pass the SAME dataService instance to scheduler
    schedulerService = new SchedulerService(tradingService, dataService);
    schedulerService.start();
    
    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    if (schedulerService) {
      schedulerService.stop();
    }
    
    if (tradingService) {
      await tradingService.shutdown();
    }
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const startServer = async () => {
  try {
    await initializeServices();
    
    app.listen(PORT, () => {
      logger.info(`🚀 Server is running on port ${PORT}`);
      logger.info(`📊 Trading bot is active and monitoring RSI signals`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Export app for testing
export { app };

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}
