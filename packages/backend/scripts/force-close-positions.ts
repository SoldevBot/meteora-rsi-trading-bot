#!/usr/bin/env ts-node

import { TradingService } from '../src/services/tradingService';
import { logger } from '../src/utils/logger';

async function forceCloseAllPositions() {
  logger.info('Starting force close of all positions...');
  
  const tradingService = new TradingService();
  
  try {
    await tradingService.initialize();
    
    const positions = tradingService.getPositions()
      .filter(p => p.status === 'ACTIVE');
    
    logger.info(`Found ${positions.length} active positions to close`);
    
    for (const position of positions) {
      try {
        logger.info(`Force closing position ${position.id.slice(0, 8)} (${position.timeframe} ${position.side})`);
        await tradingService.closePosition(position.id, true); // Force close
        logger.info(`✅ Successfully closed position ${position.id.slice(0, 8)}`);
      } catch (error) {
        logger.error(`❌ Failed to close position ${position.id.slice(0, 8)}:`, error);
      }
    }
    
    logger.info('Force close completed!');
  } catch (error) {
    logger.error('Failed to initialize trading service:', error);
  }
}

// Run the script
forceCloseAllPositions()
  .then(() => {
    logger.info('Script completed');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed:', error);
    process.exit(1);
  });
