import { Request, Response } from 'express';
import { TradingService } from '../services/tradingService';
import { logger } from '../utils/logger';
import { createError } from '../middleware/errorHandler';
import { TradingConfig, Timeframe } from 'shared';

let tradingService: TradingService;

export const setTradingService = (service: TradingService) => {
  tradingService = service;
};

export const configController = {
  async getConfig(req: Request, res: Response) {
    try {
      if (!tradingService) {
        throw createError('Trading service not initialized', 500);
      }

      const config = tradingService.getConfig();
      
      res.json({
        success: true,
        data: config,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get configuration',
        timestamp: new Date().toISOString()
      });
    }
  },

  async updateConfig(req: Request, res: Response) {
    try {
      if (!tradingService) {
        throw createError('Trading service not initialized', 500);
      }

      const updates = req.body;
      
      // Validate the updates
      const validationError = validateConfigUpdates(updates);
      if (validationError) {
        return res.status(400).json({
          success: false,
          error: validationError,
          timestamp: new Date().toISOString()
        });
      }

      tradingService.updateConfig(updates);
      const updatedConfig = tradingService.getConfig();
      
      res.json({
        success: true,
        data: updatedConfig,
        message: 'Configuration updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to update config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update configuration',
        timestamp: new Date().toISOString()
      });
    }
  }
};

function validateConfigUpdates(updates: Partial<TradingConfig>): string | null {
  const validTimeframes: Timeframe[] = ['1m', '15m', '1h', '4h', '1d'];

  if (updates.rsiPeriod !== undefined) {
    if (typeof updates.rsiPeriod !== 'number' || updates.rsiPeriod < 2 || updates.rsiPeriod > 100) {
      return 'RSI period must be a number between 2 and 100';
    }
  }

  if (updates.oversoldThreshold !== undefined) {
    if (typeof updates.oversoldThreshold !== 'number' || updates.oversoldThreshold < 1 || updates.oversoldThreshold > 50) {
      return 'Oversold threshold must be a number between 1 and 50';
    }
  }

  if (updates.overboughtThreshold !== undefined) {
    if (typeof updates.overboughtThreshold !== 'number' || updates.overboughtThreshold < 50 || updates.overboughtThreshold > 99) {
      return 'Overbought threshold must be a number between 50 and 99';
    }
  }

  if (updates.checkInterval !== undefined) {
    if (typeof updates.checkInterval !== 'number' || updates.checkInterval < 1000) {
      return 'Check interval must be at least 1000ms (1 second)';
    }
  }

  if (updates.enabledTimeframes !== undefined) {
    if (!Array.isArray(updates.enabledTimeframes)) {
      return 'Enabled timeframes must be an array';
    }
    
    for (const tf of updates.enabledTimeframes) {
      if (!validTimeframes.includes(tf)) {
        return `Invalid timeframe: ${tf}. Must be one of: ${validTimeframes.join(', ')}`;
      }
    }
  }

  if (updates.positionFactors !== undefined) {
    if (typeof updates.positionFactors !== 'object') {
      return 'Position factors must be an object';
    }
    
    for (const [timeframe, factor] of Object.entries(updates.positionFactors)) {
      if (!validTimeframes.includes(timeframe as Timeframe)) {
        return `Invalid timeframe in position factors: ${timeframe}`;
      }
      
      if (typeof factor !== 'number' || factor < 0 || factor > 1) {
        return `Position factor for ${timeframe} must be a number between 0 and 1`;
      }
    }
  }

  return null;
}
