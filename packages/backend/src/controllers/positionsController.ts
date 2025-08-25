import { Request, Response } from 'express';
import { TradingService } from '../services/tradingService';
import { logger } from '../utils/logger';
import { createError } from '../middleware/errorHandler';
import { Timeframe } from 'shared';

let tradingService: TradingService;

export const setTradingService = (service: TradingService) => {
  tradingService = service;
};

export const positionsController = {
  async getPositions(req: Request, res: Response) {
    try {
      if (!tradingService) {
        throw createError('Trading service not initialized', 500);
      }

      // Parse query parameters
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const order = req.query.order === 'asc' ? 'asc' : 'desc'; // Default to 'desc' (newest first)

      const positions = tradingService.getPositions(limit, order);
      
      res.json({
        success: true,
        data: positions,
        meta: {
          count: positions.length,
          limit: limit,
          order: order
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get positions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get positions',
        timestamp: new Date().toISOString()
      });
    }
  },

  async createPosition(req: Request, res: Response) {
    try {
      if (!tradingService) {
        throw createError('Trading service not initialized', 500);
      }

      const { timeframe, side, amount } = req.body;

      if (!timeframe || !side || !amount) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: timeframe, side, amount',
          timestamp: new Date().toISOString()
        });
      }

      const validTimeframes: Timeframe[] = ['1m', '15m', '1h', '4h', '1d'];
      if (!validTimeframes.includes(timeframe)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid timeframe. Must be one of: 1m, 15m, 1h, 4h, 1d',
          timestamp: new Date().toISOString()
        });
      }

      if (!['BUY', 'SELL'].includes(side)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid side. Must be BUY or SELL',
          timestamp: new Date().toISOString()
        });
      }

      if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Amount must be a positive number',
          timestamp: new Date().toISOString()
        });
      }

      // Validate amount based on position type for one-sided liquidity
      if (side === 'SELL') {
        // SELL position: User provides USDC amount (for USDC-only position)
        if (amount < 10) {
          return res.status(400).json({
            success: false,
            error: 'SELL position: Minimum 10 USDC required',
            timestamp: new Date().toISOString()
          });
        }
      } else if (side === 'BUY') {
        // BUY position: User provides SOL amount (for SOL-only position)
        if (amount < 0.01) {
          return res.status(400).json({
            success: false,
            error: 'BUY position: Minimum 0.01 SOL required',
            timestamp: new Date().toISOString()
          });
        }
      }

      const position = await tradingService.createPosition(timeframe, side, amount);
      
      res.status(201).json({
        success: true,
        data: position,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Failed to create position:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create position',
        timestamp: new Date().toISOString()
      });
    }
  },

  async closePosition(req: Request, res: Response) {
    try {
      if (!tradingService) {
        throw createError('Trading service not initialized', 500);
      }

      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Position ID is required',
          timestamp: new Date().toISOString()
        });
      }

      const tokensReceived = await tradingService.closePosition(id);
      
      res.json({
        success: true,
        message: 'Position closed successfully',
        data: tokensReceived || null,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Failed to close position:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to close position',
        timestamp: new Date().toISOString()
      });
    }
  },

  async syncPositions(req: Request, res: Response) {
    try {
      if (!tradingService) {
        throw createError('Trading service not initialized', 500);
      }

      const result = await tradingService.syncPositions();
      
      res.json({
        success: true,
        data: result,
        message: result.updated > 0 
          ? `Updated ${result.updated} positions that were closed externally`
          : 'All positions are already in sync',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Failed to sync positions:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to sync positions',
        timestamp: new Date().toISOString()
      });
    }
  }
};
