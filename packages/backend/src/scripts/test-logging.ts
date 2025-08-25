#!/usr/bin/env ts-node

import { logger } from '../utils/logger';

// Test the new logging system
async function testLogging() {
  logger.info('Testing new logging system...');
  
  // Test different log levels
  logger.info('This is a debug message', { component: 'test-script' });
  logger.info('This is an info message');
  logger.warn('This is a warning message');
  logger.error('This is an error message');
  
  // Test specialized logging methods
  logger.trading('Testing trading operation', { 
    side: 'BUY', 
    amount: 0.01, 
    timeframe: '1h' 
  });
  
  logger.position('Testing position operation', { 
    positionId: 'test-123', 
    status: 'ACTIVE' 
  });
  
  logger.rpc('Testing RPC operation', { 
    method: 'getBalance', 
    endpoint: 'helius' 
  });
  
  logger.wallet('Testing wallet operation', { 
    balance: { sol: 2.0, usdc: 300 } 
  });
  
  logger.api('Testing API operation', { 
    endpoint: '/api/positions', 
    method: 'GET' 
  });
  
  logger.scheduler('Testing scheduler operation', { 
    timeframe: '1h', 
    rsi: 45.2 
  });
  
  // Test performance logging
  const start = Date.now();
  await new Promise(resolve => setTimeout(resolve, 100));
  const duration = Date.now() - start;
  logger.performance('Database query', duration, { query: 'getPositions' });
  
  // Test error with context
  try {
    throw new Error('Test error for logging');
  } catch (error) {
    logger.errorWithContext('Failed to process test operation', error, { 
      context: 'test-script',
      additionalInfo: 'This is a test error'
    });
  }
  
  logger.info('Logging test completed! Check the logs directory for output files.');
}

testLogging().catch(console.error);
