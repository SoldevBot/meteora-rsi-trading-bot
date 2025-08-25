import { Request, Response } from 'express';
import { DataService } from '../services/dataService';
import { TradingService } from '../services/tradingService';
import { logger } from '../utils/logger';
import { Timeframe } from 'shared';

let dataService: DataService;
let tradingService: TradingService;

export const setServices = (trading: TradingService, data: DataService) => {
  tradingService = trading;
  dataService = data;
};

export const rsiController = {
  async getRSI(req: Request, res: Response) {
    try {
      if (!dataService) {
        return res.status(500).json({
          success: false,
          error: 'DataService not initialized',
          timestamp: new Date().toISOString()
        });
      }

      const { timeframe } = req.params;
      const validTimeframes: Timeframe[] = ['1m', '15m', '1h', '4h', '1d'];
      
      if (!validTimeframes.includes(timeframe as Timeframe)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid timeframe. Must be one of: 1m, 15m, 1h, 4h, 1d',
          timestamp: new Date().toISOString()
        });
      }

      const config = tradingService?.getConfig();
      const period = config?.rsiPeriod || 14;

      try {
        const rsiData = await dataService.getRSI('SOLUSDT', timeframe as Timeframe, period);
        
        res.json({
          success: true,
          data: rsiData,
          timestamp: new Date().toISOString()
        });
      } catch (apiError: any) {
        // Handle rate limiting gracefully
        if (apiError?.message?.includes('429') || apiError?.message?.includes('rate limit')) {
          logger.warn(`Rate limit hit for RSI ${timeframe}, serving fallback data`);
          
          // Return fallback RSI data with neutral signal
          const fallbackData = {
            value: 50, // Neutral RSI value
            signal: 'HOLD' as const,
            period,
            timestamp: new Date().toISOString()
          };
          
          return res.json({
            success: true,
            data: fallbackData,
            cached: true,
            note: 'Serving cached/fallback data due to API rate limits',
            timestamp: new Date().toISOString()
          });
        }
        
        // Re-throw other errors to be caught by outer catch block
        throw apiError;
      }
    } catch (error) {
      logger.error('Failed to get RSI data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get RSI data',
        timestamp: new Date().toISOString()
      });
    }
  },

  async getAllRSI(req: Request, res: Response) {
    try {
      if (!dataService) {
        return res.status(500).json({
          success: false,
          error: 'DataService not initialized',
          timestamp: new Date().toISOString()
        });
      }

      const config = tradingService?.getConfig();
      const timeframes = config?.enabledTimeframes || ['1m', '15m', '1h', '4h', '1d'];
      const period = config?.rsiPeriod || 14;

      try {
        const rsiDataArray = await dataService.getAllRSIData('SOLUSDT', timeframes, period);
        
        res.json({
          success: true,
          data: rsiDataArray,
          timestamp: new Date().toISOString()
        });
      } catch (apiError: any) {
        // Handle rate limiting gracefully
        if (apiError?.message?.includes('429') || apiError?.message?.includes('rate limit')) {
          logger.warn('Rate limit hit for getAllRSI, serving fallback data');
          
          // Return fallback RSI data with neutral signals for all timeframes
          const fallbackData = timeframes.map(tf => ({
            timeframe: tf,
            value: 50, // Neutral RSI value
            signal: 'HOLD' as const,
            period,
            timestamp: new Date().toISOString()
          }));
          
          return res.json({
            success: true,
            data: fallbackData,
            cached: true,
            note: 'Serving cached/fallback data due to API rate limits',
            timestamp: new Date().toISOString()
          });
        }
        
        // Re-throw other errors to be caught by outer catch block
        throw apiError;
      }
    } catch (error) {
      logger.error('Failed to get all RSI data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get RSI data',
        timestamp: new Date().toISOString()
      });
    }
  },

  async getCacheStatus(req: Request, res: Response) {
    try {
      if (!dataService) {
        return res.status(500).json({
          success: false,
          error: 'DataService not initialized',
          timestamp: new Date().toISOString()
        });
      }

      const cacheStatus = dataService.getCacheStatus();
      
      res.json({
        success: true,
        data: cacheStatus,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get cache status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get cache status',
        timestamp: new Date().toISOString()
      });
    }
  },

  async getCurrentPrice(req: Request, res: Response) {
    try {
      if (!dataService) {
        return res.status(500).json({
          success: false,
          error: 'DataService not initialized',
          timestamp: new Date().toISOString()
        });
      }

      // Get token config from environment
      const tokenConfig = {
        tradingSymbol: process.env.TRADING_SYMBOL || 'SOLUSDT',
        baseTokenSymbol: process.env.BASE_TOKEN_SYMBOL || 'SOL',
        quoteTokenSymbol: process.env.QUOTE_TOKEN_SYMBOL || 'USDC'
      };

      const currentPrice = await dataService.getCurrentPrice(tokenConfig.tradingSymbol);
      
      res.json({
        success: true,
        data: {
          price: currentPrice,
          symbol: tokenConfig.tradingSymbol,
          baseToken: tokenConfig.baseTokenSymbol,
          quoteToken: tokenConfig.quoteTokenSymbol,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get current price:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get current price',
        timestamp: new Date().toISOString()
      });
    }
  }
};
