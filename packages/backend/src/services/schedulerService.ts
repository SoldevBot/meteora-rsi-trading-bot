import * as cron from 'node-cron';
import { logger } from '../utils/logger';
import { TradingService } from './tradingService';
import { DataService } from './dataService';
import { Timeframe } from 'shared';
import { PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import BN from 'bn.js';

export class SchedulerService {
  private tradingService: TradingService;
  private dataService: DataService;
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private isShuttingDown = false;
  private isRunning = false;

  // Get trading symbol from environment
  private getTradingSymbol(): string {
    return process.env.TRADING_SYMBOL || 'SOLUSDT';
  }

  // Get harvest configuration from environment
  private getHarvestConfig() {
    return {
      enabled: process.env.HARVEST_ENABLED === 'true',
      minBins: parseInt(process.env.HARVEST_MIN_BINS || '5'),
      minPriceMove: parseFloat(process.env.HARVEST_MIN_PRICE_MOVE || '0.01'),
      bpsThreshold: parseInt(process.env.HARVEST_BPS_THRESHOLD || '100')
    };
  }

  constructor(tradingService: TradingService, dataService: DataService) {
    this.tradingService = tradingService;
    this.dataService = dataService; // Use the injected instance instead of creating new one
  }

  start(): void {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    const config = this.tradingService.getConfig();
    
    // Schedule RSI checks based on timeframes
    this.scheduleRSIChecks(config.enabledTimeframes);
    
    // Schedule position monitoring
    this.schedulePositionMonitoring();
    
    // Schedule balance history updates
    this.scheduleBalanceHistoryUpdates();
    
    this.isRunning = true;
    logger.info('Scheduler service started');
  }

  stop(): void {
    if (!this.isRunning) {
      logger.warn('Scheduler is not running');
      return;
    }

    // Stop all scheduled tasks
    this.tasks.forEach((task, name) => {
      task.stop();
      logger.info(`Stopped task: ${name}`);
    });
    
    this.tasks.clear();
    this.isRunning = false;
    logger.info('Scheduler service stopped');
  }

  private scheduleRSIChecks(timeframes: Timeframe[]): void {
    // Schedule individual RSI checks for each timeframe based on their natural frequency
    for (const timeframe of timeframes) {
      let cronPattern: string;
      let description: string;
      
      switch (timeframe) {
        case '1m':
          cronPattern = '* * * * *'; // Every minute
          description = 'every minute';
          break;
        case '15m':
          cronPattern = '*/15 * * * *'; // Every 15 minutes
          description = 'every 15 minutes';
          break;
        case '1h':
          cronPattern = '0 * * * *'; // Every hour at minute 0
          description = 'every hour';
          break;
        case '4h':
          cronPattern = '0 */4 * * *'; // Every 4 hours at minute 0
          description = 'every 4 hours';
          break;
        case '1d':
          cronPattern = '0 0 * * *'; // Daily at midnight
          description = 'daily at midnight';
          break;
        default:
          cronPattern = '*/5 * * * *'; // Default: every 5 minutes
          description = 'every 5 minutes (default)';
      }
      
      const rsiTask = cron.schedule(cronPattern, async () => {
        try {
          await this.performRSIAnalysisForTimeframe(timeframe); // Single timeframe with force update
        } catch (error) {
          logger.error(`RSI analysis failed for ${timeframe}:`, error);
        }
      }, {
        scheduled: false
      });

      this.tasks.set(`rsi-analysis-${timeframe}`, rsiTask);
      rsiTask.start();
      
      logger.scheduler(`RSI analysis for ${timeframe} scheduled (${description})`);
    }
  }

  // New method for single timeframe analysis with force update
  private async performRSIAnalysisForTimeframe(timeframe: Timeframe): Promise<void> {
    logger.info(`Performing FORCED RSI analysis for ${timeframe}...`);

    try {
      const config = this.tradingService.getConfig();
      
      // Force update the RSI data for this specific timeframe
      const rsiData = await this.dataService.getRSI(
        this.getTradingSymbol(),
        timeframe,
        config.rsiPeriod,
        true // FORCE UPDATE - ignore cache
      );

      // Check for existing positions and apply intelligent position management
      const currentPositions = this.tradingService.getPositions();
      const existingPosition = currentPositions.find(
        p => p.timeframe === timeframe && p.status === 'ACTIVE'
      );

      // Get current price for range validation
      const currentPrice = await this.dataService.getCurrentPrice();

      // Check for trading signals
      if (rsiData.value < config.oversoldThreshold) {
        // Oversold - expect price to go up, create BUY position
        if (existingPosition) {
          if (existingPosition.side === 'BUY') {
            // Check if existing BUY position is still in valid range
            const isInRange = this.tradingService.isPositionInValidRange(existingPosition, currentPrice);
            if (isInRange) {
              logger.debug(`BUY position for ${timeframe} still in valid range, skipping`, {
                currentPrice,
                priceRange: existingPosition.priceRange
              });
              return;
            } else {
              logger.info(`BUY position for ${timeframe} outside valid range, replacing`, {
                currentPrice,
                priceRange: existingPosition.priceRange
              });
              // Close and create new position with updated range
            }
          } else {
            logger.info(`Switching from ${existingPosition.side} to BUY for ${timeframe}`);
          }
          
          // Close existing position (either different side or out of range)
          try {
            await this.tradingService.closePosition(existingPosition.id, true);
            logger.info(`Successfully closed position ${existingPosition.id.slice(0, 8)} before creating BUY`);
            
            // Wait a moment to ensure the position is fully closed before creating new one
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (closeError) {
            logger.error(`Failed to close position before creating BUY:`, closeError);
            return;
          }
        }
        await this.createPositionIfNeeded(timeframe, 'BUY', rsiData.value);
        
      } else if (rsiData.value > config.overboughtThreshold) {
        // Overbought - expect price to go down, create SELL position
        if (existingPosition) {
          if (existingPosition.side === 'SELL') {
            // Check if existing SELL position is still in valid range
            const isInRange = this.tradingService.isPositionInValidRange(existingPosition, currentPrice);
            if (isInRange) {
              logger.debug(`SELL position for ${timeframe} still in valid range, skipping`, {
                currentPrice,
                priceRange: existingPosition.priceRange
              });
              return;
            } else {
              logger.info(`SELL position for ${timeframe} outside valid range, replacing`, {
                currentPrice,
                priceRange: existingPosition.priceRange
              });
              // Close and create new position with updated range
            }
          } else {
            logger.info(`Switching from ${existingPosition.side} to SELL for ${timeframe}`);
          }
          
          // Close existing position (either different side or out of range)
          try {
            await this.tradingService.closePosition(existingPosition.id, true);
            logger.info(`Successfully closed position ${existingPosition.id.slice(0, 8)} before creating SELL`);
            
            // Wait a moment to ensure the position is fully closed before creating new one
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (closeError) {
            logger.error(`Failed to close position before creating SELL:`, closeError);
            return;
          }
        }
        await this.createPositionIfNeeded(timeframe, 'SELL', rsiData.value);
        
      } else {
        logger.debug(`RSI ${rsiData.value.toFixed(2)} in neutral zone for ${timeframe}, no action needed`);
        
        // In neutral zone: Only close positions if they are VERY far out of range
        // Use stricter criteria than normal range checking
        if (existingPosition) {
          const isInRange = this.tradingService.isPositionInValidRange(existingPosition, currentPrice);
          if (!isInRange) {
            // In neutral RSI, we need to be more conservative about closing positions
            // Check if position is EXTREMELY far out of range (beyond even the buffered range by additional margin)
            const { minPrice, maxPrice } = existingPosition.priceRange || { minPrice: 0, maxPrice: 0 };
            
            // Get the buffer percentage used in isPositionInValidRange
            const bufferPercentages: { [key: string]: number } = {
              '1m': 0.02,   // 2%
              '15m': 0.05,  // 5%
              '1h': 0.08,   // 8%
              '4h': 0.12,   // 12%
              '1d': 0.20    // 20%
            };
            const bufferPercent = bufferPercentages[timeframe] || 0.05;
            const priceRange = maxPrice - minPrice;
            const normalBuffer = priceRange * bufferPercent;
            
            // Additional 50% margin beyond the normal buffer for neutral zone closure
            const extraMarginForNeutral = normalBuffer * 0.5; // 50% more margin
            const bufferedMinPrice = minPrice - normalBuffer - extraMarginForNeutral;
            const bufferedMaxPrice = maxPrice + normalBuffer + extraMarginForNeutral;
            
            const isExtremelyFarOutOfRange = currentPrice < bufferedMinPrice || currentPrice > bufferedMaxPrice;
            
            if (isExtremelyFarOutOfRange) {
              logger.info(`Position for ${timeframe} EXTREMELY FAR outside valid range in neutral zone, closing: Buffer min price ${bufferedMinPrice} and max price ${bufferedMaxPrice} actual price: ${currentPrice}`, {
                currentPrice,
                originalRange: `${minPrice.toFixed(4)} - ${maxPrice.toFixed(4)}`,
                normalBufferedRange: `${(minPrice - normalBuffer).toFixed(4)} - ${(maxPrice + normalBuffer).toFixed(4)}`,
                neutralZoneRange: `${bufferedMinPrice.toFixed(4)} - ${bufferedMaxPrice.toFixed(4)}`,
                normalBuffer: normalBuffer.toFixed(4),
                extraMargin: extraMarginForNeutral.toFixed(4),
                reason: `Beyond buffered range + ${(bufferPercent * 150 * 100).toFixed(1)}% total margin in neutral RSI`
              });
              try {
                await this.tradingService.closePosition(existingPosition.id, true);
                logger.info(`Closed extremely-out-of-range position ${existingPosition.id.slice(0, 8)} in neutral zone`);
                
                // Wait a moment after closing before any subsequent actions
                await new Promise(resolve => setTimeout(resolve, 500));
              } catch (closeError) {
                logger.error(`Failed to close out-of-range position:`, closeError);
              }
            } else {
              logger.debug(`Position for ${timeframe} out of normal range but within neutral zone tolerance, keeping open`, {
                currentPrice,
                priceRange: existingPosition.priceRange,
                reason: `Within extended neutral zone margin - waiting for clear RSI signal`
              });
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to perform FORCED RSI analysis for ${timeframe}:`, error);
    }
  }

  private schedulePositionMonitoring(): void {
    // Schedule position monitoring for each timeframe at their natural intervals
    // This prevents positions from being closed too early based on range checks
    const timeframes: Timeframe[] = ['1m', '15m', '1h', '4h', '1d'];
    
    for (const timeframe of timeframes) {
      let cronPattern: string;
      let description: string;
      
      switch (timeframe) {
        case '1m':
          cronPattern = '* * * * *'; // Every minute
          description = 'every minute';
          break;
        case '15m':
          cronPattern = '*/15 * * * *'; // Every 15 minutes
          description = 'every 15 minutes';
          break;
        case '1h':
          cronPattern = '0 * * * *'; // Every hour at minute 0
          description = 'every hour';
          break;
        case '4h':
          cronPattern = '0 */4 * * *'; // Every 4 hours at minute 0
          description = 'every 4 hours';
          break;
        case '1d':
          cronPattern = '0 0 * * *'; // Daily at midnight
          description = 'daily at midnight';
          break;
        default:
          cronPattern = '*/5 * * * *'; // Default: every 5 minutes
          description = 'every 5 minutes (default)';
      }
      
      const positionTask = cron.schedule(cronPattern, async () => {
        try {
          await this.monitorPositionsForTimeframe(timeframe);
        } catch (error) {
          logger.error(`Position monitoring failed for ${timeframe}:`, error);
        }
      }, {
        scheduled: false
      });

      this.tasks.set(`position-monitoring-${timeframe}`, positionTask);
      positionTask.start();
      
      logger.scheduler(`Position monitoring for ${timeframe} scheduled (${description})`);
    }

    // SEPARATE TASK: Harvesting läuft jede Minute für ALLE Timeframes
    const harvestTask = cron.schedule('* * * * *', async () => {
      try {
        await this.harvestAllPositions();
      } catch (error) {
        logger.error('Harvesting failed:', error);
      }
    }, {
      scheduled: false
    });

    this.tasks.set('position-harvesting', harvestTask);
    harvestTask.start();
    
    logger.scheduler('Position harvesting scheduled (every minute for all timeframes)');
  }

  private async performRSIAnalysis(timeframes: Timeframe[]): Promise<void> {
    logger.debug('Performing RSI analysis...');

    try {
      const config = this.tradingService.getConfig();
      const rsiDataArray = await this.dataService.getAllRSIData(
        this.getTradingSymbol(),
        timeframes,
        config.rsiPeriod
      );

      const currentPositions = this.tradingService.getPositions();

      for (const rsiData of rsiDataArray) {
        const existingPosition = currentPositions.find(
          p => p.timeframe === rsiData.timeframe && p.status === 'ACTIVE'
        );

        // Skip if we already have a position for this timeframe
        if (existingPosition) {
          continue;
        }

        // Check for trading signals
        if (rsiData.value < config.oversoldThreshold) {
          // Oversold - expect price to go up, create BUY position (USDC -> SOL)
          await this.createPositionIfNeeded(rsiData.timeframe, 'BUY', rsiData.value);
        } else if (rsiData.value > config.overboughtThreshold) {
          // Overbought - expect price to go down, create SELL position (SOL -> USDC)
          await this.createPositionIfNeeded(rsiData.timeframe, 'SELL', rsiData.value);
        }
      }
    } catch (error) {
      logger.error('Failed to perform RSI analysis:', error);
    }
  }

  private async createPositionIfNeeded(
    timeframe: Timeframe,
    side: 'BUY' | 'SELL',
    rsiValue: number
  ): Promise<void> {
    try {
      const config = this.tradingService.getConfig();
      const balance = await this.tradingService.getWalletBalance();
      
      // Calculate position size based on factor (percentage of relevant token balance only)
      const factor = config.positionFactors[timeframe];
      const currentPrice = await this.dataService.getCurrentPrice();
      
      let amount: number;
      let hasEnoughBalance = false;

      if (side === 'BUY') {
        // For BUY (SOL for upward liquidity): Use only SOL balance for calculation
        const relevantBalance = balance.sol;
        amount = relevantBalance * factor;
        hasEnoughBalance = balance.sol >= amount;
        
        if (!hasEnoughBalance) {
          logger.warn(`Insufficient SOL balance for BUY position on ${timeframe}`, {
            required: amount,
            available: balance.sol,
            usingPercentageOf: 'SOL balance only',
            percentage: `${(factor * 100).toFixed(1)}%`
          });
          return;
        }

        logger.info(`BUY position using ${(factor * 100).toFixed(1)}% of SOL balance`, {
          solBalance: balance.sol,
          amount,
          relevantBalanceType: 'SOL'
        });
      } else {
        // For SELL (USDC for downward liquidity): Use only USDC balance for calculation
        const relevantBalance = balance.usdc;
        amount = relevantBalance * factor;
        hasEnoughBalance = balance.usdc >= amount;
        
        if (!hasEnoughBalance) {
          logger.warn(`Insufficient USDC balance for SELL position on ${timeframe}`, {
            required: amount,
            available: balance.usdc,
            usingPercentageOf: 'USDC balance only',
            percentage: `${(factor * 100).toFixed(1)}%`
          });
          return;
        }

        logger.info(`SELL position using ${(factor * 100).toFixed(1)}% of USDC balance`, {
          usdcBalance: balance.usdc,
          amount,
          relevantBalanceType: 'USDC'
        });
      }

      // Minimum position sizes for Meteora DLMM
      const minAmount = side === 'BUY' ? 0.01 : 10; // 0.01 SOL or $10 USDC
      if (amount < minAmount) {
        logger.warn(`Position size too small for ${side} on ${timeframe}`, {
          amount,
          minAmount,
          factor,
          side,
          balanceType: side === 'BUY' ? 'SOL' : 'USDC'
        });
        return;
      }

      // Create the position
      const position = await this.tradingService.createPosition(timeframe, side, amount);
      
      logger.info('Meteora liquidity position created', {
        timeframe,
        side,
        amount,
        amountType: side === 'BUY' ? 'SOL' : 'USDC',
        rsiValue,
        positionId: position.id,
        strategy: side === 'BUY' ? 'SOL_upward_liquidity_when_price_rises' : 'USDC_downward_liquidity_when_price_falls',
        portfolioPercentage: `${(factor * 100).toFixed(1)}%`,
        priceRange: position.priceRange
      });
    } catch (error) {
      logger.error(`Failed to create ${side} position for ${timeframe}:`, error);
    }
  }

  // New method for timeframe-specific position monitoring (only range checks and RSI-based closures)
  private async monitorPositionsForTimeframe(timeframe: Timeframe): Promise<void> {
    logger.info(`Monitoring positions for timeframe ${timeframe}... (range checks only)`);

    try {
      const positions = this.tradingService.getPositions()
        .filter(p => p.status === 'ACTIVE' && p.timeframe === timeframe);

      if (positions.length === 0) {
        logger.debug(`No active positions found for timeframe ${timeframe}`);
        return;
      }

      const config = this.tradingService.getConfig();
      
      for (const position of positions) {
        try {
          // Get current RSI for position's timeframe (USE CACHED VALUES - no force update)
          const rsiData = await this.dataService.getRSI(
            this.getTradingSymbol(),
            position.timeframe,
            config.rsiPeriod,
            false // Use cached data
          );

          // Get current price for range-based position management
          const currentPrice = await this.dataService.getCurrentPrice();

          // Only check for RSI-based closure and range validation (NO HARVESTING HERE)
          const shouldClose = await this.shouldClosePosition(position, rsiData, config, currentPrice);
          
          if (shouldClose) {
            try {
              await this.tradingService.closePosition(position.id);
              logger.info(`Position closed due to signal reversal or range exit (${timeframe} check)`, {
                positionId: position.id,
                timeframe: position.timeframe,
                side: position.side,
                currentRSI: rsiData.value,
                currentPrice,
                checkInterval: timeframe
              });
            } catch (closeError: any) {
              if (!closeError.message?.includes('already being closed')) {
                logger.warn(`Failed to close position ${position.id.slice(0, 8)}:`, closeError);
              }
            }
          }
        } catch (error) {
          logger.error(`Failed to monitor position ${position.id.slice(0, 8)} for timeframe ${timeframe}:`, error);
        }
      }
    } catch (error) {
      logger.error(`Failed to monitor positions for timeframe ${timeframe}:`, error);
    }
  }

  // New method for harvesting (runs every minute for ALL positions)
  private async harvestAllPositions(): Promise<void> {
    logger.debug('Checking all positions for harvesting opportunities...');

    try {
      const positions = this.tradingService.getPositions()
        .filter(p => p.status === 'ACTIVE');

      if (positions.length === 0) {
        return;
      }

      const currentPrice = await this.dataService.getCurrentPrice();
      
      for (const position of positions) {
        try {
          // Check if this position can be harvested (regardless of timeframe)
          const shouldHarvest = await this.shouldHarvestPosition(position, currentPrice);
          
          if (shouldHarvest) {
            await this.harvestTradedBins(position, currentPrice);
            logger.info(`Harvested profits from traded bins (minute check)`, {
              positionId: position.id,
              timeframe: position.timeframe,
              side: position.side,
              currentPrice
            });
          }
        } catch (error) {
          logger.error(`Failed to check harvesting for position ${position.id.slice(0, 8)}:`, error);
        }
      }
    } catch (error) {
      logger.error('Failed to check harvesting for positions:', error);
    }
  }

  // Method to check if position should be closed (RSI reversal or range exit)
  private async shouldClosePosition(
    position: any,
    rsiData: any,
    config: any,
    currentPrice: number
  ): Promise<boolean> {
    const { side, priceRange } = position;
    const { value: rsiValue } = rsiData;
    const { oversoldThreshold, overboughtThreshold } = config;

    // Extract price range from position if available
    const { minPrice, maxPrice } = priceRange || { minPrice: 0, maxPrice: 0 };

    // BUY Position checks
    if (side === 'BUY') {
      // RSI Signal Reversal
      if (rsiValue >= overboughtThreshold) {
        logger.info(`📊 Closing BUY position (RSI REVERSAL): RSI ${rsiValue} >= ${overboughtThreshold}`);
        return true;
      }
      
      // Price breakthrough (through all bins)
      if (maxPrice > 0 && currentPrice >= maxPrice) {
        logger.info(`🚀 Closing BUY position (PRICE BREAKTHROUGH): Price ${currentPrice} >= maxPrice ${maxPrice}`);
        return true;
      }
      
      // Check if position is out of valid range (uses timeframe-specific intervals)
      const isInRange = this.tradingService.isPositionInValidRange(position, currentPrice);
      if (!isInRange) {
        logger.info(`🔻 Closing BUY position (OUT OF RANGE): Position no longer in valid range`);
        return true;
      }
    }

    // SELL Position checks
    if (side === 'SELL') {
      // RSI Signal Reversal
      if (rsiValue <= oversoldThreshold) {
        logger.info(`📊 Closing SELL position (RSI REVERSAL): RSI ${rsiValue} <= ${oversoldThreshold}`);
        return true;
      }
      
      // Price breakthrough (through all bins)
      if (minPrice > 0 && currentPrice <= minPrice) {
        logger.info(`🚀 Closing SELL position (PRICE BREAKTHROUGH): Price ${currentPrice} <= minPrice ${minPrice}`);
        return true;
      }
      
      // Check if position is out of valid range (uses timeframe-specific intervals)
      const isInRange = this.tradingService.isPositionInValidRange(position, currentPrice);
      if (!isInRange) {
        logger.info(`🔻 Closing SELL position (OUT OF RANGE): Position no longer in valid range`);
        return true;
      }
    }

    return false; // Keep position open
  }

  // Method to check if position should be harvested (only for minute checks)
  private async shouldHarvestPosition(
    position: any,
    currentPrice: number
  ): Promise<boolean> {
    const { side, priceRange } = position;
    const { minPrice, maxPrice } = priceRange || { minPrice: 0, maxPrice: 0 };

    // Check if harvesting is enabled
    const harvestConfig = this.getHarvestConfig();
    if (!harvestConfig.enabled) {
      return false;
    }

    // BUY Position harvesting
    if (side === 'BUY' && minPrice > 0 && currentPrice > minPrice) {
      try {
        const dlmm = this.tradingService.getDLMMPool(position.timeframe);
        if (dlmm) {
          const activeBin = await dlmm.getActiveBin();
          const currentBinId = activeBin.binId;
          
          const positionPublicKey = new PublicKey(position.positionPubKey);
          const lbPosition = await dlmm.getPosition(positionPublicKey);
          const originalLowerBinId = lbPosition.positionData.lowerBinId;
          
          const binsSkipped = currentBinId - originalLowerBinId;
          
          if (binsSkipped >= harvestConfig.minBins) {
            logger.info(`💰 HARVEST BUY position: ${binsSkipped} bins traded (≥${harvestConfig.minBins})`);
            return true;
          }
        }
      } catch (error) {
        logger.error(`Failed to check BUY harvest bins:`, error);
        // Fallback: harvest if price moved significantly
        return currentPrice > minPrice * 1.02; // 2% price increase
      }
    }

    // SELL Position harvesting
    if (side === 'SELL' && maxPrice > 0 && currentPrice < maxPrice) {
      try {
        const dlmm = this.tradingService.getDLMMPool(position.timeframe);
        if (dlmm) {
          const activeBin = await dlmm.getActiveBin();
          const currentBinId = activeBin.binId;
          
          const positionPublicKey = new PublicKey(position.positionPubKey);
          const lbPosition = await dlmm.getPosition(positionPublicKey);
          const originalUpperBinId = lbPosition.positionData.upperBinId;
          
          const binsSkipped = originalUpperBinId - currentBinId;
          
          if (binsSkipped >= harvestConfig.minBins) {
            logger.info(`💰 HARVEST SELL position: ${binsSkipped} bins traded (≥${harvestConfig.minBins})`);
            return true;
          }
        }
      } catch (error) {
        logger.error(`Failed to check SELL harvest bins:`, error);
        // Fallback: harvest if price moved significantly
        return currentPrice < maxPrice * 0.98; // 2% price decrease
      }
    }

    return false;
  }

  private async shouldCloseOrHarvestPosition(
    position: any,
    rsiData: any,
    config: any,
    currentPrice: number
  ): Promise<'CLOSE' | 'HARVEST' | 'HOLD'> {
    const { side, createdAt, priceRange } = position;
    const { value: rsiValue } = rsiData;
    const { oversoldThreshold, overboughtThreshold } = config;

    // Extract price range from position if available
    const { minPrice, maxPrice } = priceRange || { minPrice: 0, maxPrice: 0 };

    // Meteora intelligente Liquiditäts-Management-Strategie
    
    // BUY Position (SOL liquidity above current price):
    if (side === 'BUY') {
      // PRIORITY 1: RSI Signal Reversal - CLOSE IMMEDIATELY
      if (rsiValue >= overboughtThreshold) {
        logger.info(`📊 Closing BUY position (RSI SIGNAL REVERSAL): RSI reached overbought (${rsiValue} >= ${overboughtThreshold}) - signal changed!`);
        return 'CLOSE';
      }
      
      // PRIORITY 2: Price breakthrough - CLOSE IMMEDIATELY
      if (maxPrice > 0 && currentPrice >= maxPrice) {
        logger.info(`🚀 Closing BUY position (PRICE BREAKTHROUGH): Price ${currentPrice} >= maxPrice ${maxPrice} - through all bins!`);
        return 'CLOSE';
      }
      
      // PRIORITY 3: Price moved too far below minPrice (beyond buffer) - CLOSE
      const originalRange = maxPrice - minPrice;
      const bufferPercent = 0.05; // 5% buffer for position closure 
      const buffer = originalRange * bufferPercent;
      const bufferedMinPrice = minPrice - buffer;
      
      if (minPrice > 0 && currentPrice < bufferedMinPrice) {
        logger.info(`🔻 Closing BUY position (PRICE TOO LOW): Price ${currentPrice} < buffered minPrice ${bufferedMinPrice.toFixed(4)} (original: ${minPrice.toFixed(4)}, buffer: ${buffer.toFixed(4)}) - position out of range!`);
        return 'CLOSE';
      }
      
      // PRIORITY 4: Harvest profits if price moved up (configurable harvesting)
      if (minPrice > 0 && currentPrice > minPrice) {
        // Check if harvesting is enabled
        const harvestConfig = this.getHarvestConfig();
        if (!harvestConfig.enabled) {
          logger.debug('Harvesting disabled in configuration, skipping harvest');
          return 'HOLD';
        }

        // Check if enough bins were traded to make harvesting worthwhile
        try {
          // Get DLMM pool to check bin difference
          const dlmm = this.tradingService.getDLMMPool(position.timeframe);
          if (dlmm) {
            const activeBin = await dlmm.getActiveBin();
            const currentBinId = activeBin.binId;
            
            // Get position data to find original lower bin
            const positionPublicKey = new PublicKey(position.id);
            const lbPosition = await dlmm.getPosition(positionPublicKey);
            const originalLowerBinId = lbPosition.positionData.lowerBinId;
            
            // Calculate bins skipped (current bin - original lower bin)
            const binsSkipped = currentBinId - originalLowerBinId;
            
            if (binsSkipped >= harvestConfig.minBins) {
              logger.info(`💰 HARVEST BUY position: Price ${currentPrice} > minPrice ${minPrice} - ${binsSkipped} bins were traded (≥${harvestConfig.minBins}), taking profits!`);
              return 'HARVEST';
            } else {
              logger.debug(`⏳ BUY position profitable but not enough bins skipped: ${binsSkipped} < ${harvestConfig.minBins}, waiting for more movement`, {
                positionId: position.id.slice(0, 8),
                currentPrice,
                minPrice,
                binsSkipped,
                minRequired: harvestConfig.minBins,
                currentBinId,
                originalLowerBinId
              });
              return 'HOLD';
            }
          }
        } catch (error) {
          logger.error(`Failed to check bin difference for BUY harvest:`, error);
          // Fallback to simple price check
          logger.info(`💰 HARVEST BUY position (fallback): Price ${currentPrice} > minPrice ${minPrice} - bins were traded, taking profits!`);
          return 'HARVEST';
        }
      }
    }

    // SELL Position (USDC liquidity below current price):
    if (side === 'SELL') {
      // PRIORITY 1: RSI Signal Reversal - CLOSE IMMEDIATELY
      if (rsiValue <= oversoldThreshold) {
        logger.info(`📊 Closing SELL position (RSI SIGNAL REVERSAL): RSI reached oversold (${rsiValue} <= ${oversoldThreshold}) - signal changed!`);
        return 'CLOSE';
      }
      
      // PRIORITY 2: Price breakthrough - CLOSE IMMEDIATELY
      if (minPrice > 0 && currentPrice <= minPrice) {
        logger.info(`📉 Closing SELL position (PRICE BREAKTHROUGH): Price ${currentPrice} <= minPrice ${minPrice} - through all bins!`);
        return 'CLOSE';
      }
      
      // PRIORITY 3: Price moved too far above maxPrice (beyond buffer) - CLOSE
      const originalRange = maxPrice - minPrice;
      const bufferPercent = 0.05; // 5% buffer for position closure
      const buffer = originalRange * bufferPercent;
      const bufferedMaxPrice = maxPrice + buffer;
      
      if (maxPrice > 0 && currentPrice > bufferedMaxPrice) {
        logger.info(`🔺 Closing SELL position (PRICE TOO HIGH): Price ${currentPrice} > buffered maxPrice ${bufferedMaxPrice.toFixed(4)} (original: ${maxPrice.toFixed(4)}, buffer: ${buffer.toFixed(4)}) - position out of range!`);
        return 'CLOSE';
      }
      
      // PRIORITY 4: Harvest profits if price moved down (with minimum bin requirements)
      if (maxPrice > 0 && currentPrice < maxPrice) {
        try {
          // Get DLMM instance for bin calculations
          const dlmm = this.tradingService.getDLMMPool(position.timeframe);
          if (!dlmm) {
            logger.warn(`DLMM pool not found for timeframe ${position.timeframe}, falling back to simple harvest`);
            logger.info(`💰 HARVEST SELL position (fallback): Price ${currentPrice} < maxPrice ${maxPrice} - bins were traded, taking profits!`);
            return 'HARVEST';
          }

          // Get current and original bin IDs to calculate bin difference
          const currentBinId = await dlmm.getActiveBin().then(bin => bin.binId);
          
          // Get position data to find original upper bin
          const positionPublicKey = new PublicKey(position.id);
          const lbPosition = await dlmm.getPosition(positionPublicKey);
          const originalUpperBinId = lbPosition.positionData.upperBinId;
          
          // Calculate bins skipped (original upper bin - current bin)
          const binsSkipped = originalUpperBinId - currentBinId;
          const minBinsForHarvest = 5; // Minimum 5 bins must be skipped
          
          if (binsSkipped >= minBinsForHarvest) {
            logger.info(`💰 HARVEST SELL position: Price ${currentPrice} < maxPrice ${maxPrice} - ${binsSkipped} bins were traded (≥${minBinsForHarvest}), taking profits!`);
            return 'HARVEST';
          } else {
            logger.debug(`⏳ SELL position profitable but not enough bins skipped: ${binsSkipped} < ${minBinsForHarvest}, waiting for more movement`, {
              positionId: position.id.slice(0, 8),
              currentPrice,
              maxPrice,
              binsSkipped,
              minRequired: minBinsForHarvest,
              currentBinId,
              originalUpperBinId
            });
            return 'HOLD';
          }
        } catch (error) {
          logger.error(`Failed to check bin difference for SELL harvest:`, error);
          // Fallback to simple price check
          logger.info(`💰 HARVEST SELL position (fallback): Price ${currentPrice} < maxPrice ${maxPrice} - bins were traded, taking profits!`);
          return 'HARVEST';
        }
      }
    }

    // No action needed
    return 'HOLD';
  }

  private async harvestTradedBins(position: any, currentPrice: number): Promise<void> {
    const { side, id: positionId, timeframe, priceRange } = position;
    const { minPrice, maxPrice } = priceRange || { minPrice: 0, maxPrice: 0 };

    // Validate that we have valid price data (not bin IDs mistaken as prices)
    const isValidPriceRange = minPrice > 0 && maxPrice > 0 && minPrice < 10000 && maxPrice < 10000;
    if (!isValidPriceRange) {
      logger.error(`Invalid price range detected in position ${positionId.slice(0, 8)} - likely corrupted data`, {
        minPrice,
        maxPrice,
        currentPrice,
        positionId: positionId.slice(0, 8),
        reason: 'Price values seem to be bin IDs instead of actual prices'
      });
      // Don't attempt harvesting with invalid data
      return;
    }

    try {
      // Get DLMM pool for this timeframe
      const dlmm = this.tradingService.getDLMMPool(timeframe);
      if (!dlmm) {
        throw new Error(`DLMM pool not found for timeframe: ${timeframe}`);
      }

      // INTELLIGENT HARVESTING: Only harvest if significant price movement
      const priceRange = maxPrice - minPrice;
      const priceMovement = side === 'BUY' ? (currentPrice - minPrice) : (maxPrice - currentPrice);
      const movementPercentage = (priceMovement / priceRange) * 100;
      
      // More relaxed timeframe-based harvesting thresholds for actual profit taking
      const harvestThresholds: { [key: string]: number } = {
        '1m': 5,    // 5% of range must be traded (much more aggressive)
        '15m': 8,   // 8% of range must be traded
        '1h': 10,   // 10% of range must be traded
        '4h': 12,   // 12% of range must be traded
        '1d': 15    // 15% of range must be traded
      };
      
      const threshold = harvestThresholds[timeframe] || 10; // Default 10%
      
      if (movementPercentage < threshold) {
        logger.debug(`Skipping harvest - insufficient price movement for ${timeframe}`, {
          positionId: positionId.slice(0, 8),
          side,
          priceMovement: priceMovement.toFixed(4),
          movementPercentage: movementPercentage.toFixed(2),
          threshold,
          currentPrice,
          priceRange: `${minPrice.toFixed(4)} - ${maxPrice.toFixed(4)}`,
          reason: `Need ${threshold}% movement, only ${movementPercentage.toFixed(2)}%`
        });
        return;
      }

      logger.info(`📊 Intelligent harvest triggered for ${timeframe}`, {
        positionId: positionId.slice(0, 8),
        side,
        movementPercentage: movementPercentage.toFixed(2),
        threshold,
        priceMovement: priceMovement.toFixed(4),
        totalRange: priceRange.toFixed(4)
      });

      // SIMPLIFIED HARVESTING: Harvest specific tokens from traded bins
      let newMinPrice: number;
      let newMaxPrice: number;
      let fromBinId: number;
      let toBinId: number;

      // Get the position object to extract current bin range
      const positionPublicKey = new PublicKey(positionId);
      
      try {
        // Get the actual position data from blockchain
        const lbPosition = await dlmm.getPosition(positionPublicKey);
        const positionData = lbPosition.positionData;
        const currentLowerBinId = positionData.lowerBinId;
        const currentUpperBinId = positionData.upperBinId;
        
        // Get active bin for reference
        const activeBin = await dlmm.getActiveBin();
        const currentBinId = activeBin.binId;
        
        if (side === 'BUY') {
          // BUY: Harvest USDC from bins that are now below current price
          // These bins had USDC that got converted to SOL as price moved up
          
          // Calculate which bins to harvest (from lower bound to current active bin)
          fromBinId = currentLowerBinId;
          toBinId = Math.min(currentBinId - 1, currentUpperBinId); // Harvest up to just below current bin
          
          // Check minimum bin count for cost-effective harvesting
          const binsToHarvest = toBinId - fromBinId + 1;
          const minBinsForHarvest = 3; // Minimum 3 bins for cost-effective harvesting
          
          if (binsToHarvest < minBinsForHarvest) {
            logger.info(`⏳ BUY harvest skipped - not enough bins to make it cost-effective`, {
              positionId: positionId.slice(0, 8),
              binsToHarvest,
              minRequired: minBinsForHarvest,
              fromBinId,
              toBinId,
              reason: `Need at least ${minBinsForHarvest} bins to harvest, only ${binsToHarvest} available`
            });
            return;
          }
          
          // Keep original position range unchanged after harvesting
          newMinPrice = minPrice; // Keep original min price
          newMaxPrice = maxPrice; // Keep original max price
          
          logger.info(`🟢 BUY HARVEST: Removing USDC from bins ${fromBinId} to ${toBinId} (keeping original range)`, {
            positionId: positionId.slice(0, 8),
            originalRange: `${minPrice.toFixed(4)} - ${maxPrice.toFixed(4)}`,
            harvestStrategy: 'Remove USDC from traded bins below current price, preserve original range',
            currentPrice,
            currentBinId,
            binsToHarvest: toBinId - fromBinId + 1
          });
          
        } else {
          // SELL: Harvest SOL from bins that are now above current price
          // These bins had SOL that got converted to USDC as price moved down
          
          // Calculate which bins to harvest (from current active bin to upper bound)
          fromBinId = Math.max(currentBinId + 1, currentLowerBinId); // Harvest from just above current bin
          toBinId = currentUpperBinId;
          
          // Check minimum bin count for cost-effective harvesting
          const binsToHarvest = toBinId - fromBinId + 1;
          const minBinsForHarvest = 3; // Minimum 3 bins for cost-effective harvesting
          
          if (binsToHarvest < minBinsForHarvest) {
            logger.info(`⏳ SELL harvest skipped - not enough bins to make it cost-effective`, {
              positionId: positionId.slice(0, 8),
              binsToHarvest,
              minRequired: minBinsForHarvest,
              fromBinId,
              toBinId,
              reason: `Need at least ${minBinsForHarvest} bins to harvest, only ${binsToHarvest} available`
            });
            return;
          }
          
          // Keep original position range unchanged after harvesting
          newMinPrice = minPrice; // Keep original min price
          newMaxPrice = maxPrice; // Keep original max price
          
          logger.info(`🔴 SELL HARVEST: Removing SOL from bins ${fromBinId} to ${toBinId} (keeping original range)`, {
            positionId: positionId.slice(0, 8),
            originalRange: `${minPrice.toFixed(4)} - ${maxPrice.toFixed(4)}`,
            harvestStrategy: 'Remove SOL from traded bins above current price, preserve original range',
            currentPrice,
            currentBinId,
            binsToHarvest: toBinId - fromBinId + 1
          });
        }

        // Validate bin range makes sense
        if (fromBinId > toBinId || fromBinId < currentLowerBinId || toBinId > currentUpperBinId) {
          logger.warn(`Invalid harvest bin range, skipping harvest`, {
            fromBinId, 
            toBinId, 
            currentBinId,
            positionRange: `${currentLowerBinId} - ${currentUpperBinId}`,
            reason: 'Bin range outside position bounds or invalid'
          });
          return;
        }

        // Use DLMM SDK removeLiquidity to harvest from specific bins
        const harvestTransaction = await dlmm.removeLiquidity({
          user: this.tradingService.getWallet()!.publicKey,
          position: positionPublicKey,
          fromBinId,
          toBinId,
          bps: new BN(10000), // Remove 100% of liquidity from these bins
          shouldClaimAndClose: false // Keep position open!
        });

        // Execute harvest transactions
        if (harvestTransaction) {
          if (Array.isArray(harvestTransaction)) {
            logger.info(`Executing ${harvestTransaction.length} harvest transactions`);
            for (let i = 0; i < harvestTransaction.length; i++) {
              const tx = harvestTransaction[i];
              logger.info(`Sending harvest transaction ${i + 1}/${harvestTransaction.length}`);
              const signature = await sendAndConfirmTransaction(
                this.tradingService.getConnection(),
                tx,
                [this.tradingService.getWallet()!],
                {
                  commitment: 'confirmed',
                  preflightCommitment: 'confirmed'
                }
              );
              logger.info(`Harvest transaction ${i + 1} confirmed: ${signature.slice(0, 8)}`);
            }
          } else {
            logger.info(`Sending single harvest transaction`);
            const signature = await sendAndConfirmTransaction(
              this.tradingService.getConnection(),
              harvestTransaction,
              [this.tradingService.getWallet()!],
              {
                commitment: 'confirmed',
                preflightCommitment: 'confirmed'
              }
            );
            logger.info(`Harvest transaction confirmed: ${signature.slice(0, 8)}`);
          }
          
          // CRITICAL: Mark position with harvest status for proper cleanup later
          // Add a harvested flag to track that this position has been partially harvested
          const currentPosition = this.tradingService.getPositions().find(p => p.id === positionId);
          if (currentPosition) {
            // Add custom field to track harvesting
            (currentPosition as any).hasBeenHarvested = true;
            (currentPosition as any).lastHarvestAt = Date.now();
            logger.info(`🏷️ Marked position ${positionId.slice(0, 8)} as harvested for proper cleanup tracking`);
          }
          
          logger.info(`✅ Successfully harvested ${side === 'BUY' ? 'USDC' : 'SOL'} from traded bins`, {
            positionId: positionId.slice(0, 8),
            harvestedToken: side === 'BUY' ? 'USDC' : 'SOL',
            binsHarvested: `${fromBinId} to ${toBinId}`,
            transactionsExecuted: Array.isArray(harvestTransaction) ? harvestTransaction.length : 1,
            positionMarkedAsHarvested: true
          });
        } else {
          logger.warn(`No transactions returned from removeLiquidity - no liquidity to harvest`);
        }

      } catch (error) {
        logger.error(`Failed to harvest from position ${positionId.slice(0, 8)}:`, error);
        
        // Fallback: Keep original position range unchanged even on error
        try {
          newMinPrice = minPrice; // Keep original min price
          newMaxPrice = maxPrice; // Keep original max price
          
          await this.tradingService.updatePositionRange(positionId, {
            minPrice: newMinPrice,
            maxPrice: newMaxPrice
          });
          
          logger.info(`Preserved original position range after harvest error`, {
            positionId: positionId.slice(0, 8),
            originalRange: `${minPrice.toFixed(4)} - ${maxPrice.toFixed(4)}`
          });
          
        } catch (rangeError) {
          logger.error(`Failed to preserve position range:`, rangeError);
        }
        return;
      }

      // Keep position range unchanged after successful harvest
      await this.tradingService.updatePositionRange(positionId, {
        minPrice: newMinPrice, // Will be the same as original minPrice
        maxPrice: newMaxPrice  // Will be the same as original maxPrice
      });

      logger.info(`✅ Successfully processed harvest for ${side === 'BUY' ? 'USDC' : 'SOL'} (range preserved)`, {
        positionId: positionId.slice(0, 8),
        originalRange: `${minPrice.toFixed(4)} - ${maxPrice.toFixed(4)}`,
        harvestedToken: side === 'BUY' ? 'USDC' : 'SOL',
        strategy: 'Harvested profits while preserving original position range'
      });

    } catch (error) {
      logger.error(`Failed to harvest traded bins for position ${positionId.slice(0, 8)}:`, error);
    }
  }

  private priceToBinId(price: number, dlmm: any, activeBin: any): number {
    try {
      // Use DLMM SDK's proper price conversion methods
      if (dlmm.lbPair && dlmm.lbPair.activeId !== undefined && activeBin) {
        const activeBinId = dlmm.lbPair.activeId;
        const binStep = dlmm.lbPair.binStep;
        
        // CRITICAL FIX: Use activeBin.price directly instead of fromPricePerLamport
        const activeBinPrice = parseFloat(activeBin.price);
        
        // Validate active bin price
        if (isNaN(activeBinPrice) || activeBinPrice <= 0) {
          throw new Error(`Invalid active bin price: ${activeBinPrice}`);
        }
        
        // Calculate the bin ID based on the price using DLMM logarithmic formula
        const priceRatio = Math.log(price / activeBinPrice) / Math.log(1 + binStep / 10000);
        const targetBinId = Math.round(activeBinId + priceRatio);
        
        // Validate result
        if (isNaN(targetBinId) || !isFinite(targetBinId)) {
          throw new Error(`Invalid bin ID calculated: ${targetBinId}`);
        }
        
        logger.debug(`Price to Bin ID conversion (FIXED)`, {
          price,
          activeBinId,
          activeBinPrice,
          binStep,
          priceRatio,
          targetBinId,
          formula: 'log(price/activePrice) / log(1 + binStep/10000)'
        });
        
        return targetBinId;
      } else {
        throw new Error('DLMM SDK lbPair or activeBin not available');
      }
    } catch (error: any) {
      logger.error('Error converting price to bin ID:', error);
      
      // Enhanced fallback using mathematical approximation
      try {
        if (!activeBin) {
          throw new Error('No active bin data for fallback');
        }
        
        const activeBinId = activeBin.binId;
        const activeBinPrice = parseFloat(activeBin.price);
        const binStep = dlmm.lbPair?.binStep || 10; // fallback bin step
        
        // Validate fallback data
        if (isNaN(activeBinPrice) || activeBinPrice <= 0) {
          throw new Error(`Invalid fallback active bin price: ${activeBinPrice}`);
        }
        
        // Mathematical approximation
        const priceRatio = Math.log(price / activeBinPrice) / Math.log(1 + binStep / 10000);
        const fallbackBinId = Math.round(activeBinId + priceRatio);
        
        if (isNaN(fallbackBinId) || !isFinite(fallbackBinId)) {
          throw new Error(`Fallback calculation also failed: ${fallbackBinId}`);
        }
        
        logger.warn(`Using fallback bin ID calculation`, {
          price,
          activeBinId,
          activeBinPrice,
          binStep,
          fallbackBinId,
          originalError: error.message
        });
        
        return fallbackBinId;
      } catch (fallbackError) {
        logger.error(`Both primary and fallback bin ID calculations failed:`, fallbackError);
        throw new Error(`Failed to convert price ${price} to bin ID: ${error.message}`);
      }
    }
  }

  private scheduleBalanceHistoryUpdates(): void {
    // Schedule balance history updates every hour
    const balanceTask = cron.schedule('0 * * * *', async () => {
      if (this.isShuttingDown) return;
      
      try {
        logger.scheduler('Running hourly balance history update...');
        
        // Add hourly balance snapshot
        await this.tradingService.addHourlyBalanceSnapshot();
        
        logger.scheduler('Hourly balance history updated successfully');
      } catch (error) {
        logger.error('Scheduled balance history update failed:', error);
      }
    }, {
      scheduled: false
    });

    this.tasks.set('balance-history-update', balanceTask);
    balanceTask.start();
    
    logger.scheduler('Balance history updates scheduled (every hour with daily compression)');
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getTaskStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    this.tasks.forEach((task, name) => {
      // ScheduledTask doesn't have a running property, so we'll track status manually
      status[name] = this.tasks.has(name);
    });
    return status;
  }
}
