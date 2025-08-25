import { Request, Response } from 'express';
import { TradingService } from '../services/tradingService';
import { logger } from '../utils/logger';
import { createError } from '../middleware/errorHandler';

// This would be injected via dependency injection in a real app
let tradingService: TradingService;

export const setTradingService = (service: TradingService) => {
  tradingService = service;
};

export const walletController = {
  async getBalance(req: Request, res: Response) {
    try {
      if (!tradingService) {
        throw createError('Trading service not initialized', 500);
      }

      const balance = await tradingService.getWalletBalance();
      
      res.json({
        success: true,
        data: balance,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get wallet balance:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get wallet balance',
        timestamp: new Date().toISOString()
      });
    }
  },

  async getBalanceHistory(req: Request, res: Response) {
    try {
      if (!tradingService) {
        throw createError('Trading service not initialized', 500);
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const hours = req.query.hours ? parseInt(req.query.hours as string) : undefined;
      
      let history;
      if (hours) {
        history = await tradingService.getBalanceHistoryForRange(hours);
      } else {
        history = await tradingService.getBalanceHistory(limit);
      }
      
      // Calculate some useful statistics
      const stats = {
        totalEntries: history.length,
        oldestEntry: history.length > 0 ? new Date(history[0].timestamp).toISOString() : null,
        newestEntry: history.length > 0 ? new Date(history[history.length - 1].timestamp).toISOString() : null,
        dataType: 'hybrid_hourly_daily',
        storageOptimization: 'Hourly data for last 24h, daily averages for older data'
      };
      
      // Calculate balance trend if we have enough data
      let trend = null;
      if (history.length >= 2) {
        const oldest = history[0];
        const newest = history[history.length - 1];
        const solChange = newest.sol - oldest.sol;
        const usdcChange = newest.usdc - oldest.usdc;
        const days = Math.ceil((newest.timestamp - oldest.timestamp) / (24 * 60 * 60 * 1000));
        
        trend = {
          period: `${days} days`,
          sol: {
            change: Number(solChange.toFixed(6)),
            percentage: oldest.sol > 0 ? Number(((solChange / oldest.sol) * 100).toFixed(2)) : 0
          },
          usdc: {
            change: Number(usdcChange.toFixed(2)),
            percentage: oldest.usdc > 0 ? Number(((usdcChange / oldest.usdc) * 100).toFixed(2)) : 0
          }
        };
      }
      
      res.json({
        success: true,
        data: history,
        meta: {
          ...stats,
          trend,
          requestedLimit: limit,
          requestedHours: hours
        }
      });
    } catch (error) {
      logger.error('Error getting balance history:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get balance history' 
      });
    }
  }
};
