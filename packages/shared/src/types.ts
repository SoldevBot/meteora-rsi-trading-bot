export interface RSIData {
  timeframe: Timeframe;
  value: number;
  timestamp: number;
  signal: 'OVERSOLD' | 'OVERBOUGHT' | 'NEUTRAL';
}

export interface Position {
  id: string;
  poolId: string;
  timeframe: Timeframe;
  side: 'BUY' | 'SELL'; // BUY = expect price up (USDC->SOL), SELL = expect price down (SOL->USDC)
  amount: number;
  price: number;
  createdAt: number;
  status: 'ACTIVE' | 'CLOSED';
  pnl?: number;
  positionPubKey?: string;
  lastRangeCheck?: number; // Timestamp of last range validity check
  // Price range for position validity check
  priceRange?: {
    minPrice: number;
    maxPrice: number;
    binRange: {
      minBinId: number;
      maxBinId: number;
    };
  };
}

export interface WalletBalance {
  sol: number;
  usdc: number;
  timestamp: number;
}

export interface TradingConfig {
  rsiPeriod: number;
  oversoldThreshold: number;
  overboughtThreshold: number;
  checkInterval: number;
  positionFactors: Record<Timeframe, number>;
  enabledTimeframes: Timeframe[];
  useTestnet: boolean;
}

export interface PoolConfig {
  poolId: string;
  binStep: number;
  baseFee: number;
  maxFee: number;
}

export type Timeframe = '1m' | '15m' | '1h' | '4h' | '1d';

export const DEFAULT_POOL_CONFIGS: Record<Timeframe, PoolConfig> = {
  '1m': {
    poolId: '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6',
    binStep: 4,
    baseFee: 0.001,
    maxFee: 0.1
  },
  '15m': {
    poolId: 'BGm1tav58oGcsQJehL9WXBFXF7D27vZsKefj4xJKD5Y',
    binStep: 10,
    baseFee: 0.001,
    maxFee: 0.1
  },
  '1h': { 
    poolId: 'BVRbyLjjfSBcoyiYFuxbgKYnWuiFaF9CSXEa5vdSZ9Hh',
    binStep: 20,
    baseFee: 0.002,
    maxFee: 0.1
  },
  '4h': { 
    poolId: '5XRqv7LCoC5FhWKk5JN8n4kCrJs3e4KH1XsYzKeMd5Nt',
    binStep: 50,
    baseFee: 0.005,
    maxFee: 0.1
  },
  '1d': { 
    poolId: 'CgqwPLSFfht89pF5RSKGUUMFj5zRxoUt4861w2SkXaqY',
    binStep: 80,
    baseFee: 0.0005,
    maxFee: 0.1
  },
};

export const DEFAULT_POSITION_FACTORS: Record<Timeframe, number> = {
  '1m': 0.08,   // 8%
  '15m': 0.15,  // 15%
  '1h': 0.20,   // 20%
  '4h': 0.35,   // 35%
  '1d': 0.40    // 40%
};

export interface KlineData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface SwapQuoteRequest {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
}

export interface SwapQuoteResponse {
  inputAmount: number;
  outputAmount: number;
  priceImpactPct: number;
  routePlan: any[];
}

// Solana Token Mints
export const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
} as const;

export const BINANCE_TIMEFRAME_MAP: Record<Timeframe, string> = {
  '1m': '1m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d'
};
