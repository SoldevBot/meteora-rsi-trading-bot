import axios, { AxiosInstance } from 'axios';
import { RSI } from 'technicalindicators';
import { logger } from '../utils/logger';
import { 
  Timeframe, 
  RSIData, 
  KlineData, 
  BINANCE_TIMEFRAME_MAP 
} from 'shared';

// Temporary workaround for development mode
const BINANCE_TIMEFRAME_MAP_FALLBACK: Record<Timeframe, string> = {
  '1m': '1m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d'
};

export class DataService {
  private readonly binanceBaseUrl = 'https://api.binance.com/api/v3';
  private rsiCache: Map<string, { data: RSIData; timestamp: number }> = new Map();
  private priceCache: { price: number; timestamp: number } | null = null;
  private requestQueue: Promise<any> = Promise.resolve();
  
  // Sync locks to prevent duplicate API calls
  private rsiLocks: Map<string, Promise<RSIData>> = new Map();
  private priceLock: Promise<number> | null = null;
  
  // Create persistent Axios instance with connection pooling
  private axiosInstance: AxiosInstance;
  
  constructor() {
    this.axiosInstance = axios.create({
      timeout: 15000, // Increased timeout to 15 seconds
      maxRedirects: 3,
      headers: {
        'User-Agent': 'MeteoraBot/1.0',
        'Connection': 'keep-alive'
      },
      // Connection pooling configuration
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      // Keep connections alive
      httpsAgent: process.env.NODE_ENV === 'production' 
        ? new (require('https').Agent)({
            keepAlive: true,
            maxSockets: 10,
            maxFreeSockets: 5,
            timeout: 60000,
            freeSocketTimeout: 30000,
          })
        : undefined
    });
    
    // Add retry interceptor
    this.setupRetryInterceptor();
  }
  
  private setupRetryInterceptor(): void {
    this.axiosInstance.interceptors.response.use(
      response => response,
      async error => {
        const config = error.config;
        
        // Initialize retry count
        config._retryCount = config._retryCount || 0;
        const maxRetries = 3;
        
        // Check if we should retry
        const shouldRetry = (
          config._retryCount < maxRetries &&
          (
            error.code === 'ECONNABORTED' || // Timeout
            error.code === 'ENOTFOUND' ||    // DNS issues
            error.code === 'ECONNRESET' ||   // Connection reset
            error.code === 'ETIMEDOUT' ||    // Network timeout
            (error.response?.status >= 500) || // Server errors
            (error.response?.status === 429)   // Rate limit
          )
        );
        
        if (shouldRetry) {
          config._retryCount++;
          
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, config._retryCount - 1) * 1000;
          
          logger.warn(`Request failed, retrying in ${delay}ms (attempt ${config._retryCount}/${maxRetries})`, {
            error: error.message,
            code: error.code,
            status: error.response?.status
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.axiosInstance.request(config);
        }
        
        return Promise.reject(error);
      }
    );
  }
  
  // Method to reset connections if needed
  public resetConnections(): void {
    logger.info('🔄 Resetting HTTP connections and clearing caches');
    
    // Create new axios instance
    this.axiosInstance = axios.create({
      timeout: 15000,
      maxRedirects: 3,
      headers: {
        'User-Agent': 'MeteoraBot/1.0',
        'Connection': 'keep-alive'
      },
      httpsAgent: process.env.NODE_ENV === 'production' 
        ? new (require('https').Agent)({
            keepAlive: true,
            maxSockets: 10,
            maxFreeSockets: 5,
            timeout: 60000,
            freeSocketTimeout: 30000,
          })
        : undefined
    });
    
    this.setupRetryInterceptor();
    
    // Clear caches to force fresh data
    this.rsiCache.clear();
    this.priceCache = null;
    
    logger.info('✅ HTTP connections reset and caches cleared');
  }
  
  // Smart cache TTL based on timeframe
  private getCacheTTL(timeframe: Timeframe): number {
    switch (timeframe) {
      case '1m': return 45000;    // 45 seconds (ensure fresh data every minute)
      case '15m': return 600000;  // 10 minutes (refresh well before 15min mark)
      case '1h': return 3000000;  // 50 minutes (refresh well before hour mark)
      case '4h': return 12000000; // 3h 20min (refresh well before 4h mark)
      case '1d': return 82800000; // 23 hours (refresh well before daily mark)
      default: return 30000;      // Default: 30 seconds
    }
  }
  
  private readonly PRICE_CACHE_TTL = 30000; // 30 seconds (longer for price stability)
  private readonly REQUEST_DELAY = 300; // 300ms between requests (safer rate limiting)

  async getKlines(
    symbol: string = this.getTradingSymbol(),
    timeframe: Timeframe,
    limit: number = 500
  ): Promise<KlineData[]> {
    // Use request queue to prevent rate limiting
    return this.requestQueue = this.requestQueue.then(async () => {
      try {
        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, this.REQUEST_DELAY));
        
        const interval = BINANCE_TIMEFRAME_MAP?.[timeframe] || BINANCE_TIMEFRAME_MAP_FALLBACK[timeframe];
        const url = `${this.binanceBaseUrl}/klines`;
        
        logger.info(`Fetching kline data for ${symbol} ${timeframe}`);
        
        const response = await this.axiosInstance.get(url, {
          params: {
            symbol,
            interval,
            limit
          }
        });

        return response.data.map((kline: any[]) => ({
          openTime: kline[0],
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4]),
          volume: parseFloat(kline[5]),
          closeTime: kline[6]
        }));
      } catch (error: any) {
        if (error.response?.status === 429) {
          logger.warn(`Rate limited by Binance for ${symbol} ${timeframe}, waiting 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          throw new Error(`Rate limited for ${symbol} ${timeframe} - try again later`);
        }
        logger.error(`Failed to fetch kline data for ${symbol} ${timeframe}:`, error);
        throw error;
      }
    });
  }

  // Get trading symbol from environment
  private getTradingSymbol(): string {
    return process.env.TRADING_SYMBOL || 'SOLUSDT';
  }

  async getRSI(
    symbol: string = this.getTradingSymbol(),
    timeframe: Timeframe,
    period: number = 14,
    forceUpdate: boolean = false // New parameter for scheduler
  ): Promise<RSIData> {
    const cacheKey = `${symbol}-${timeframe}-${period}`;
    const now = Date.now();
    const cacheTTL = this.getCacheTTL(timeframe);
    
    // Check cache first with timeframe-specific TTL (but skip if force update)
    const cached = this.rsiCache.get(cacheKey);
    if (!forceUpdate && cached && (now - cached.timestamp) < cacheTTL) {
      logger.info(`🔄 Using cached RSI for ${symbol} ${timeframe}: ${cached.data.value.toFixed(2)} (age: ${Math.round((now - cached.timestamp) / 1000)}s)`);
      return cached.data;
    }
    
    // ⚡ SYNC LOCK: Check if another request is already in progress
    const existingLock = this.rsiLocks.get(cacheKey);
    if (existingLock) {
      logger.info(`🔒 RSI request for ${symbol} ${timeframe} already in progress, waiting for result...`);
      return await existingLock;
    }
    
    // Create new lock for this request
    const lockPromise = this.fetchRSIData(symbol, timeframe, period, forceUpdate, cacheKey, now, cacheTTL);
    this.rsiLocks.set(cacheKey, lockPromise);
    
    try {
      const result = await lockPromise;
      return result;
    } finally {
      // Clean up lock after completion
      this.rsiLocks.delete(cacheKey);
    }
  }
  
  private async fetchRSIData(
    symbol: string,
    timeframe: Timeframe,
    period: number,
    forceUpdate: boolean,
    cacheKey: string,
    now: number,
    cacheTTL: number
  ): Promise<RSIData> {
    // Log why we're updating
    if (forceUpdate) {
      logger.info(`🔥 Force updating RSI for ${symbol} ${timeframe} (scheduler override)`);
    } else {
      logger.info(`⏰ Cache expired for ${symbol} ${timeframe}, fetching new data`);
    }

    try {
      const klineData = await this.getKlines(symbol, timeframe, period + 50);
      const closePrices = klineData.map((k: any) => k.close);
      
      const rsiValues = RSI.calculate({
        values: closePrices,
        period
      });

      const latestRSI = rsiValues[rsiValues.length - 1];
      const timestamp = klineData[klineData.length - 1].closeTime;

      let signal: 'OVERSOLD' | 'OVERBOUGHT' | 'NEUTRAL' = 'NEUTRAL';
      
      if (latestRSI < 30) {
        signal = 'OVERSOLD';
      } else if (latestRSI > 70) {
        signal = 'OVERBOUGHT';
      }

      const rsiData: RSIData = {
        timeframe,
        value: latestRSI,
        timestamp,
        signal
      };

      // Cache the result
      this.rsiCache.set(cacheKey, { data: rsiData, timestamp: now });
      logger.info(`📝 NEW RSI cached for ${symbol} ${timeframe}: ${latestRSI.toFixed(2)} (${forceUpdate ? 'FORCE UPDATE' : 'cache expired'})`);

      return rsiData;
    } catch (error) {
      logger.error(`Failed to calculate RSI for ${symbol} ${timeframe}:`, error);
      throw error;
    }
  }

  async getCurrentPrice(symbol: string = this.getTradingSymbol()): Promise<number> {
    const now = Date.now();
    
    // Check cache first
    if (this.priceCache && (now - this.priceCache.timestamp) < this.PRICE_CACHE_TTL) {
      logger.info(`💰 Using cached price for ${symbol}: $${this.priceCache.price} (age: ${Math.round((now - this.priceCache.timestamp) / 1000)}s)`);
      return this.priceCache.price;
    }

    // ⚡ SYNC LOCK: Check if another price request is already in progress
    if (this.priceLock) {
      logger.info(`🔒 Price request for ${symbol} already in progress, waiting for result...`);
      return await this.priceLock;
    }

    // Create new lock for this request
    this.priceLock = this.fetchPriceData(symbol, now);
    
    try {
      const result = await this.priceLock;
      return result;
    } finally {
      // Clean up lock after completion
      this.priceLock = null;
    }
  }
  
  private async fetchPriceData(symbol: string, now: number): Promise<number> {
    // Use request queue to prevent rate limiting
    return this.requestQueue = this.requestQueue.then(async () => {
      try {
        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, this.REQUEST_DELAY));
        
        logger.info(`📡 Fetching fresh price for ${symbol} from Binance API...`);
        const url = `${this.binanceBaseUrl}/ticker/price`;
        const response = await this.axiosInstance.get(url, {
          params: { symbol }
        });

        const price = parseFloat(response.data.price);
        
        // Cache the result
        this.priceCache = { price, timestamp: now };
        logger.info(`💰 NEW price cached for ${symbol}: $${price}`);

        return price;
      } catch (error: any) {
        if (error.response?.status === 429) {
          logger.warn(`Rate limited by Binance for price ${symbol}, waiting 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          throw new Error(`Rate limited for price ${symbol} - try again later`);
        }
        logger.error(`Failed to fetch current price for ${symbol}:`, error);
        throw error;
      }
    });
  }

  async getAllRSIData(
    symbol: string = this.getTradingSymbol(),
    timeframes: Timeframe[],
    period: number = 14,
    forceUpdate: boolean = false // Pass through force update flag
  ): Promise<RSIData[]> {
    // Use sequential processing instead of parallel to better utilize cache
    const results: RSIData[] = [];
    
    for (const timeframe of timeframes) {
      try {
        const rsiData = await this.getRSI(symbol, timeframe, period, forceUpdate);
        results.push(rsiData);
      } catch (error) {
        logger.error(`Failed to fetch RSI for ${timeframe}:`, error);
        // Continue with other timeframes instead of failing completely
        
        // Create fallback data for this timeframe
        const fallbackData: RSIData = {
          timeframe,
          value: 50, // Neutral RSI
          timestamp: Date.now(),
          signal: 'NEUTRAL'
        };
        results.push(fallbackData);
      }
    }
    
    return results;
  }

  // Hilfsmethode zum Überwachen des Cache-Status
  getCacheStatus(): {
    rsiCacheSize: number;
    priceCache: { hasData: boolean; age?: number };
    cacheEntries: Array<{ key: string; age: number; timeframe: string }>;
  } {
    const now = Date.now();
    
    return {
      rsiCacheSize: this.rsiCache.size,
      priceCache: {
        hasData: !!this.priceCache,
        age: this.priceCache ? Math.round((now - this.priceCache.timestamp) / 1000) : undefined
      },
      cacheEntries: Array.from(this.rsiCache.entries()).map(([key, value]) => ({
        key,
        age: Math.round((now - value.timestamp) / 1000),
        timeframe: key.split('-')[1] || 'unknown'
      }))
    };
  }
}
