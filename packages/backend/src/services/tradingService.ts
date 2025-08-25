import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { sendAndConfirmTransaction } from '@solana/web3.js';
import DLMM, { StrategyType } from '@meteora-ag/dlmm';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import BN from 'bn.js';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { 
  Position, 
  WalletBalance, 
  TradingConfig, 
  DEFAULT_POOL_CONFIGS, 
  DEFAULT_POSITION_FACTORS,
  Timeframe,
  TOKEN_MINTS
} from 'shared';

// Environment-based pool configuration
const getPoolConfigFromEnv = () => {
  return {
    '1m': {
      poolId: process.env.POOL_ID_1M || '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6',
      binStep: parseInt(process.env.BIN_STEP_1M || '4'),
      baseFee: parseFloat(process.env.BASE_FEE_1M || '0.001'),
      maxFee: 0.1
    },
    '15m': {
      poolId: process.env.POOL_ID_15M || 'BGm1tav58oGcsQJehL9WXBFXF7D27vZsKefj4xJKD5Y',
      binStep: parseInt(process.env.BIN_STEP_15M || '10'),
      baseFee: parseFloat(process.env.BASE_FEE_15M || '0.001'),
      maxFee: 0.1
    },
    '1h': { 
      poolId: process.env.POOL_ID_1H || 'BVRbyLjjfSBcoyiYFuxbgKYnWuiFaF9CSXEa5vdSZ9Hh',
      binStep: parseInt(process.env.BIN_STEP_1H || '20'),
      baseFee: parseFloat(process.env.BASE_FEE_1H || '0.002'),
      maxFee: 0.1
    },
    '4h': { 
      poolId: process.env.POOL_ID_4H || '5XRqv7LCoC5FhWKk5JN8n4kCrJs3e4KH1XsYzKeMd5Nt',
      binStep: parseInt(process.env.BIN_STEP_4H || '50'),
      baseFee: parseFloat(process.env.BASE_FEE_4H || '0.005'),
      maxFee: 0.1
    },
    '1d': { 
      poolId: process.env.POOL_ID_1D || 'CgqwPLSFfht89pF5RSKGUUMFj5zRxoUt4861w2SkXaqY',
      binStep: parseInt(process.env.BIN_STEP_1D || '80'),
      baseFee: parseFloat(process.env.BASE_FEE_1D || '0.0005'),
      maxFee: 0.1
    },
  };
};

const getPositionFactorsFromEnv = () => {
  return {
    '1m': parseFloat(process.env.POSITION_FACTOR_1M || '0.08'),
    '15m': parseFloat(process.env.POSITION_FACTOR_15M || '0.15'),
    '1h': parseFloat(process.env.POSITION_FACTOR_1H || '0.20'),
    '4h': parseFloat(process.env.POSITION_FACTOR_4H || '0.35'),
    '1d': parseFloat(process.env.POSITION_FACTOR_1D || '0.40')
  };
};

// Token configuration from environment
const getTokenConfig = () => {
  return {
    baseTokenMint: process.env.BASE_TOKEN_MINT || 'So11111111111111111111111111111111111111112', // SOL
    quoteTokenMint: process.env.QUOTE_TOKEN_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    baseTokenSymbol: process.env.BASE_TOKEN_SYMBOL || 'SOL',
    quoteTokenSymbol: process.env.QUOTE_TOKEN_SYMBOL || 'USDC',
    tradingSymbol: process.env.TRADING_SYMBOL || 'SOLUSDT'
  };
};

// Strategy configuration from environment
const getStrategyConfig = () => {
  const defaultStrategy = process.env.TRADING_STRATEGY || 'Curve';
  return {
    default: defaultStrategy,
    '1m': process.env.STRATEGY_TYPE_1M || defaultStrategy,
    '15m': process.env.STRATEGY_TYPE_15M || defaultStrategy,
    '1h': process.env.STRATEGY_TYPE_1H || defaultStrategy,
    '4h': process.env.STRATEGY_TYPE_4H || defaultStrategy,
    '1d': process.env.STRATEGY_TYPE_1D || defaultStrategy
  };
};

// Convert strategy string to StrategyType enum
const getStrategyType = (timeframe: Timeframe): StrategyType => {
  const strategies = getStrategyConfig();
  const strategyName = strategies[timeframe] || strategies.default;
  
  switch (strategyName.toLowerCase()) {
    case 'bidask':
      return StrategyType.BidAsk;
    case 'curve':
      return StrategyType.Curve;
    case 'spot':
      return StrategyType.Spot;
    default:
      logger.warn(`Unknown strategy type: ${strategyName}, defaulting to Curve`);
      return StrategyType.Curve;
  }
};

export class TradingService {
  private connection: Connection;
  private wallet: Keypair | null = null;
  private dlmmPools: Map<Timeframe, DLMM | null> = new Map();
  private positions: Map<string, Position> = new Map();
  private config: TradingConfig;
  private positionsFilePath: string;
  private balanceHistoryFilePath: string;
  private balanceHistory: (WalletBalance & { timestamp: number })[] = [];
  private rpcRequestQueue: Promise<any> = Promise.resolve();
  private lastBalanceUpdate: number = 0;
  private cachedBalance: WalletBalance | null = null;
  
  // Position closing concurrency control
  private closingPositions: Set<string> = new Set();
  
  // RPC Rate limiting configuration - More conservative settings
  private readonly RPC_REQUEST_DELAY = 250; // 250ms between RPC calls (increased from 100ms)
  private readonly BALANCE_CACHE_TTL = 120000; // 2 minutes cache (increased from 30 seconds)
  private readonly MAX_RETRIES = 5; // Increased retries
  private readonly RATE_LIMIT_DELAY = 5000; // 5 seconds wait on rate limit
  
  // Transaction configuration
  private readonly TRANSACTION_TIMEOUT = parseInt(process.env.TRANSACTION_TIMEOUT || '180000'); // 3 minutes
  private readonly TRANSACTION_MAX_RETRIES = parseInt(process.env.TRANSACTION_MAX_RETRIES || '5');
  private readonly TRANSACTION_SKIP_PREFLIGHT = process.env.TRANSACTION_SKIP_PREFLIGHT === 'true';
  private readonly MAX_RECENT_BLOCKHASH_AGE = parseInt(process.env.TRANSACTION_MAX_RECENT_BLOCKHASH_AGE || '60');

  constructor() {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');
    
    // Create data directory and file path for positions and balance history
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.positionsFilePath = path.join(dataDir, 'positions.json');
    this.balanceHistoryFilePath = path.join(dataDir, 'balanceHistory.json');
    
    this.config = {
      rsiPeriod: parseInt(process.env.RSI_PERIOD || '14'),
      oversoldThreshold: parseInt(process.env.RSI_OVERSOLD_THRESHOLD || '30'),
      overboughtThreshold: parseInt(process.env.RSI_OVERBOUGHT_THRESHOLD || '70'),
      checkInterval: parseInt(process.env.DEFAULT_CHECK_INTERVAL || '60000'),
      positionFactors: getPositionFactorsFromEnv(),
      enabledTimeframes: ['1m', '15m', '1h', '4h', '1d'],
      useTestnet: process.env.NODE_ENV !== 'production'
    };

    logger.info('Trading service initialized', { config: this.config });
  }

  // Robust transaction sending with retries and better error handling
  private async sendTransactionWithRetry(
    transaction: Transaction,
    signers: Keypair[],
    description: string = 'transaction'
  ): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.TRANSACTION_MAX_RETRIES; attempt++) {
      try {
        logger.info(`Sending ${description} (attempt ${attempt}/${this.TRANSACTION_MAX_RETRIES})`);
        
        // Get fresh blockhash for each attempt to avoid expiration
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        
        const signature = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          signers,
          {
            commitment: 'confirmed',
            preflightCommitment: 'confirmed',
            skipPreflight: this.TRANSACTION_SKIP_PREFLIGHT,
            maxRetries: 3, // Internal retries per attempt
          }
        );
        
        logger.info(`${description} successful`, { 
          signature: signature.slice(0, 8),
          attempt,
          blockhash: blockhash.slice(0, 8)
        });
        
        return signature;
        
      } catch (error: any) {
        lastError = error;
        const isRetryable = error.message?.includes('block height exceeded') ||
                           error.message?.includes('Blockhash not found') ||
                           error.message?.includes('Transaction was not confirmed') ||
                           error.message?.includes('timeout');
        
        if (!isRetryable || attempt === this.TRANSACTION_MAX_RETRIES) {
          logger.error(`${description} failed (attempt ${attempt}/${this.TRANSACTION_MAX_RETRIES}):`, error.message);
          if (attempt === this.TRANSACTION_MAX_RETRIES) {
            throw new Error(`${description} failed after ${this.TRANSACTION_MAX_RETRIES} attempts: ${error.message}`);
          }
        } else {
          logger.warn(`${description} failed (attempt ${attempt}/${this.TRANSACTION_MAX_RETRIES}), retrying...`, {
            error: error.message,
            nextAttemptIn: `${attempt * 2}s`
          });
          
          // Exponential backoff: 2s, 4s, 6s, 8s
          await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        }
      }
    }
    
    throw lastError || new Error(`${description} failed after ${this.TRANSACTION_MAX_RETRIES} attempts`);
  }

  // RPC Rate-Limited wrapper to prevent 429 errors
  private async rpcCall<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    return this.rpcRequestQueue = this.rpcRequestQueue.then(async () => {
      let attempt = 0;
      while (attempt < this.MAX_RETRIES) {
        try {
          // Add delay between RPC calls
          if (attempt > 0) {
            const delay = Math.min(Math.pow(2, attempt) * this.RATE_LIMIT_DELAY, 30000); // Cap at 30s
            logger.rpc(`RPC retry ${attempt} for ${operationName}, waiting ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            // Always wait between calls to prevent rate limiting
            await new Promise(resolve => setTimeout(resolve, this.RPC_REQUEST_DELAY));
          }
          
          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;
          
          logger.rpc(`RPC ${operationName} completed in ${duration}ms`, { attempt: attempt + 1 });
          
          if (attempt > 0) {
            logger.info(`RPC ${operationName} succeeded after ${attempt} retries`);
          }
          return result;
        } catch (error: any) {
          attempt++;
          const isRateLimit = error.message?.includes('429') || 
                            error.message?.includes('Too many requests') ||
                            error.message?.includes('rate limit') ||
                            error.code === 429;
          
          if (isRateLimit) {
            logger.warn(`RPC rate limited for ${operationName}, attempt ${attempt}/${this.MAX_RETRIES}`, {
              error: error.message,
              willRetry: attempt < this.MAX_RETRIES
            });
            
            if (attempt >= this.MAX_RETRIES) {
              logger.errorWithContext(`RPC rate limited after ${this.MAX_RETRIES} attempts`, error, { 
                operation: operationName 
              });
              throw new Error(`RPC rate limited after ${this.MAX_RETRIES} attempts: ${operationName}`);
            }
            continue;
          }
          
          // Non-rate-limit errors should not retry
          logger.errorWithContext(`RPC ${operationName} failed`, error, { attempt });
          throw error;
        }
      }
      throw new Error(`Max retries reached for ${operationName}`);
    });
  }

  async initialize(): Promise<void> {
    try {
      // Load existing data first
      await this.loadPositions();
      await this.loadBalanceHistory();
      
      // Initialize wallet
      await this.initializeWallet();
      
      // Initialize DLMM pools
      await this.initializePools();
      
      // Sync position status with blockchain after initialization
      await this.syncPositionsWithBlockchain();
      
      logger.info('Trading service fully initialized');
    } catch (error) {
      logger.error('Failed to initialize trading service:', error);
      throw error;
    }
  }

  private async loadPositions(): Promise<void> {
    try {
      if (fs.existsSync(this.positionsFilePath)) {
        const data = fs.readFileSync(this.positionsFilePath, 'utf8');
        let positionsArray: Position[] = JSON.parse(data);
        
        // IMPORTANT: Keep ALL active positions regardless of age
        const activePositions = positionsArray.filter(p => p.status === 'ACTIVE');
        const inactivePositions = positionsArray.filter(p => p.status !== 'ACTIVE');
        
        // Clean up old INACTIVE positions on load - keep only last 100
        const maxInactivePositions = 100;
        let keptInactivePositions = inactivePositions;
        
        if (inactivePositions.length > maxInactivePositions) {
          const oldInactiveCount = inactivePositions.length;
          // Sort inactive positions by createdAt timestamp (newest first)
          inactivePositions.sort((a, b) => b.createdAt - a.createdAt);
          keptInactivePositions = inactivePositions.slice(0, maxInactivePositions);
          
          logger.info(`Position startup cleanup: kept ${maxInactivePositions} newest inactive positions, removed ${oldInactiveCount - maxInactivePositions} old inactive positions`);
        }
        
        // Combine ALL active + limited inactive positions
        const finalPositions = [...activePositions, ...keptInactivePositions];
        
        // Convert array back to Map
        this.positions = new Map();
        finalPositions.forEach(position => {
          this.positions.set(position.id, position);
        });
        
        logger.info(`Loaded ${finalPositions.length} existing positions from storage`, {
          activePositions: activePositions.length,
          inactivePositions: keptInactivePositions.length,
          totalLoaded: finalPositions.length,
          strategy: 'preserve_all_active_positions'
        });
        
        // Save cleaned positions back to file if cleanup occurred
        if (finalPositions.length < positionsArray.length) {
          await this.savePositions();
          logger.info('Saved cleaned positions back to storage (inactive positions cleaned)');
        }
      } else {
        logger.info('No existing positions file found, starting fresh');
      }
    } catch (error) {
      logger.error('Failed to load positions:', error);
      // Don't throw error, just start with empty positions
      this.positions = new Map();
    }
  }

  private async savePositions(): Promise<void> {
    try {
      // Convert Map to array for JSON storage
      let positionsArray = Array.from(this.positions.values());
      
      // IMPORTANT: Keep ALL active positions regardless of age
      const activePositions = positionsArray.filter(p => p.status === 'ACTIVE');
      const inactivePositions = positionsArray.filter(p => p.status !== 'ACTIVE');
      
      // Keep only the last 100 INACTIVE positions (sorted by creation time)
      const maxInactivePositions = 100;
      let keptInactivePositions = inactivePositions;
      
      if (inactivePositions.length > maxInactivePositions) {
        // Sort inactive positions by createdAt timestamp (newest first)
        inactivePositions.sort((a, b) => b.createdAt - a.createdAt);
        
        // Keep only the newest 100 inactive positions
        const oldInactiveCount = inactivePositions.length;
        keptInactivePositions = inactivePositions.slice(0, maxInactivePositions);
        
        logger.info(`Position cleanup: kept ${maxInactivePositions} newest inactive positions, removed ${oldInactiveCount - maxInactivePositions} old inactive positions`);
      }
      
      // Combine ALL active positions + limited inactive positions
      positionsArray = [...activePositions, ...keptInactivePositions];
      
      // Update the in-memory positions map
      this.positions.clear();
      for (const position of positionsArray) {
        this.positions.set(position.id, position);
      }
      
      logger.info(`Saved ${positionsArray.length} positions to storage`, {
        activePositions: activePositions.length,
        inactivePositions: keptInactivePositions.length,
        totalPositions: positionsArray.length,
        strategy: 'keep_all_active_limit_inactive'
      });
      
      fs.writeFileSync(this.positionsFilePath, JSON.stringify(positionsArray, null, 2));
    } catch (error) {
      logger.error('Failed to save positions:', error);
    }
  }

  private async loadBalanceHistory(): Promise<void> {
    try {
      if (fs.existsSync(this.balanceHistoryFilePath)) {
        const data = fs.readFileSync(this.balanceHistoryFilePath, 'utf8');
        const balanceArray = JSON.parse(data);
        this.balanceHistory = Array.isArray(balanceArray) ? balanceArray : [];
        logger.info(`Loaded ${this.balanceHistory.length} balance history entries`);
      } else {
        this.balanceHistory = [];
        logger.info('No existing balance history found, starting fresh');
      }
    } catch (error) {
      logger.error('Failed to load balance history:', error);
      // Don't throw error, just start with empty history
      this.balanceHistory = [];
    }
  }

  private async saveBalanceHistory(): Promise<void> {
    try {
      fs.writeFileSync(this.balanceHistoryFilePath, JSON.stringify(this.balanceHistory, null, 2));
      logger.debug(`Saved ${this.balanceHistory.length} balance history entries to storage`);
    } catch (error) {
      logger.error('Failed to save balance history:', error);
    }
  }

  // Compress balance history: keep hourly data for last 24h, daily averages for older data
  private async compressOldBalanceHistory(): Promise<void> {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000); // 24 hours ago
    
    // Separate recent (last 24h) and old data
    const recentData = this.balanceHistory.filter(entry => entry.timestamp >= oneDayAgo);
    const oldData = this.balanceHistory.filter(entry => entry.timestamp < oneDayAgo);
    
    if (oldData.length === 0) {
      // No old data to compress
      return;
    }
    
    // Group old data by day and calculate daily averages
    const dailyGroups = new Map<string, (WalletBalance & { timestamp: number })[]>();
    
    for (const entry of oldData) {
      const date = new Date(entry.timestamp);
      const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      
      if (!dailyGroups.has(dayKey)) {
        dailyGroups.set(dayKey, []);
      }
      dailyGroups.get(dayKey)!.push(entry);
    }
    
    // Calculate daily averages
    const compressedData: (WalletBalance & { timestamp: number })[] = [];
    
    for (const [dayKey, dayEntries] of dailyGroups) {
      if (dayEntries.length === 1) {
        // Only one entry for this day, keep as is but mark as compressed
        compressedData.push({
          ...dayEntries[0],
          isDailyAverage: true
        } as any);
      } else {
        // Calculate averages for this day
        const avgSol = dayEntries.reduce((sum, entry) => sum + entry.sol, 0) / dayEntries.length;
        const avgUsdc = dayEntries.reduce((sum, entry) => sum + entry.usdc, 0) / dayEntries.length;
        
        // Use the last timestamp of the day as representative timestamp
        const lastTimestamp = Math.max(...dayEntries.map(entry => entry.timestamp));
        
        compressedData.push({
          sol: Number(avgSol.toFixed(6)),
          usdc: Number(avgUsdc.toFixed(2)),
          timestamp: lastTimestamp,
          isDailyAverage: true,
          originalEntryCount: dayEntries.length
        } as any);
      }
    }
    
    // Sort compressed data by timestamp
    compressedData.sort((a, b) => a.timestamp - b.timestamp);
    
    // Combine compressed old data with recent hourly data
    this.balanceHistory = [...compressedData, ...recentData];
    
    // Limit total entries to prevent excessive memory usage (keep last 30 days + recent 24h data)
    const maxEntries = 30 + 24; // 30 daily averages + 24 hourly entries
    if (this.balanceHistory.length > maxEntries) {
      this.balanceHistory = this.balanceHistory.slice(-maxEntries);
    }
    
    logger.info(`Compressed balance history: ${oldData.length} old entries → ${compressedData.length} daily averages, ${recentData.length} hourly entries`, {
      totalEntries: this.balanceHistory.length,
      compressionRatio: oldData.length > 0 ? (oldData.length / compressedData.length).toFixed(1) : 'N/A',
      oldDataDays: dailyGroups.size,
      recentDataHours: recentData.length,
      strategy: 'hourly_recent_daily_old'
    });
  }

  // Sync position status with blockchain to detect externally closed positions
  private async syncPositionsWithBlockchain(): Promise<void> {
    logger.position('Starting position sync with blockchain');
    
    const activePositions = Array.from(this.positions.values())
      .filter(p => p.status === 'ACTIVE');
      
    if (activePositions.length === 0) {
      logger.position('No active positions to sync');
      return;
    }
    
    let updatedCount = 0;
    let processedCount = 0;
    
    // Process positions in batches to avoid rate limiting
    const BATCH_SIZE = 3;
    for (let i = 0; i < activePositions.length; i += BATCH_SIZE) {
      const batch = activePositions.slice(i, i + BATCH_SIZE);
      
      logger.position(`Processing position batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(activePositions.length/BATCH_SIZE)}`, {
        batchSize: batch.length,
        totalPositions: activePositions.length
      });
      
      for (const position of batch) {
        try {
          if (!position.positionPubKey) {
            logger.warn(`Position ${position.id} has no positionPubKey, skipping sync`);
            continue;
          }
          
          const positionPubKey = new PublicKey(position.positionPubKey);
          
          // Try to get position account info from blockchain
          const accountInfo = await this.rpcCall(
            () => this.connection.getAccountInfo(positionPubKey),
            `getPositionAccountInfo_${position.id.slice(0, 8)}`
          );
          
          processedCount++;
          
          // If account doesn't exist or has no data, position was closed
          if (!accountInfo || !accountInfo.data || accountInfo.data.length === 0) {
            logger.position(`Position ${position.id.slice(0, 8)} (${position.timeframe}) was closed externally`, {
              positionId: position.id,
              timeframe: position.timeframe,
              side: position.side
            });
            position.status = 'CLOSED';
            updatedCount++;
          }
        } catch (error) {
          logger.warn(`Failed to sync position ${position.id.slice(0, 8)}:`, error);
          // Don't fail the entire sync process for one position
        }
      }
      
      // Add delay between batches to prevent rate limiting
      if (i + BATCH_SIZE < activePositions.length) {
        logger.position(`Waiting before next batch to prevent rate limiting`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between batches
      }
    }
    
    if (updatedCount > 0) {
      await this.savePositions();
      logger.position(`Updated ${updatedCount}/${processedCount} positions that were closed externally`);
    } else {
      logger.position(`All ${processedCount} positions are in sync with blockchain`);
    }
  }

  private async initializeWallet(): Promise<void> {
    const seedPhrase = process.env.WALLET_SEED_PHRASE;
    
    if (!seedPhrase) {
      throw new Error('WALLET_SEED_PHRASE not found in environment variables');
    }

    if (!bip39.validateMnemonic(seedPhrase)) {
      throw new Error('Invalid seed phrase provided');
    }

    // Convert mnemonic to seed
    const seed = await bip39.mnemonicToSeed(seedPhrase);
    
    // Use Phantom's derivation path: m/44'/501'/0'/0'
    // This matches what Phantom wallet uses
    const derivationPath = "m/44'/501'/0'/0'";
    const derivedSeed = derivePath(derivationPath, seed.toString('hex')).key;
    
    // Create wallet from the derived seed
    this.wallet = Keypair.fromSeed(derivedSeed);
    
    logger.info('Wallet initialized with Phantom-compatible derivation', { 
      publicKey: this.wallet.publicKey.toString(),
      derivationPath,
      isTestnet: this.config.useTestnet
    });

    // Log wallet balance
    const balance = await this.getWalletBalance();
    logger.info('Current wallet balance:', balance);
  }

  private async initializePools(): Promise<void> {
    logger.info('Initializing DLMM pools...');
    
    for (const timeframe of this.config.enabledTimeframes) {
      try {
        // Use environment-based pool configuration
        const poolConfigs = getPoolConfigFromEnv();
        const poolConfig = poolConfigs[timeframe];
        const poolPublicKey = new PublicKey(poolConfig.poolId);
        
        logger.info(`Using pool for ${timeframe}:`, { 
          poolId: poolConfig.poolId,
          source: 'environment_config'
        });
        
        const dlmm = await DLMM.create(this.connection, poolPublicKey);
        this.dlmmPools.set(timeframe, dlmm);
        
        logger.info(`Initialized DLMM pool for ${timeframe}`, {
          poolId: poolConfig.poolId
        });
      } catch (error) {
        logger.error(`Failed to initialize pool for ${timeframe}:`, error);
        // Set null for failed pools so other services can continue
        this.dlmmPools.set(timeframe, null);
      }
    }
  }

  async getWalletBalance(): Promise<WalletBalance> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const now = Date.now();
    
    // Use cached balance if available and fresh
    if (this.cachedBalance && (now - this.lastBalanceUpdate) < this.BALANCE_CACHE_TTL) {
      logger.debug('Using cached wallet balance', { 
        age: now - this.lastBalanceUpdate,
        ttl: this.BALANCE_CACHE_TTL 
      });
      return this.cachedBalance;
    }

    try {
      logger.wallet('Fetching fresh wallet balance from blockchain');
      
      const tokenConfig = getTokenConfig();
      
      // Get base token balance (SOL) with rate limiting
      const baseTokenBalance = await this.rpcCall(
        () => this.connection.getBalance(this.wallet!.publicKey),
        'getBalance'
      ) as number;
      
      // Get quote token balance (USDC) from token accounts with rate limiting
      let quoteTokenBalance = 0;
      try {
        const response = await this.rpcCall(
          () => this.connection.getTokenAccountsByOwner(
            this.wallet!.publicKey,
            {
              mint: new PublicKey(tokenConfig.quoteTokenMint)
            }
          ),
          'getTokenAccountsByOwner'
        ) as any;

        if (response.value.length > 0) {
          const accountInfo = await this.rpcCall(
            () => this.connection.getTokenAccountBalance(response.value[0].pubkey),
            'getTokenAccountBalance'
          ) as any;
          quoteTokenBalance = parseInt(accountInfo.value.amount);
        }
      } catch (error) {
        logger.warn(`Could not fetch ${tokenConfig.quoteTokenSymbol} balance (using 0):`, error);
        // Continue with 0 quote token balance instead of failing
      }

      const balance = {
        sol: baseTokenBalance / 1e9, // Convert lamports to base token (SOL)
        usdc: quoteTokenBalance / 1e6, // Convert to quote token decimals (USDC)
        timestamp: now
      };

      // Cache the balance
      this.cachedBalance = balance;
      this.lastBalanceUpdate = now;

      logger.wallet('Wallet balance updated successfully', { 
        balance,
        cached: true,
        cacheTTL: this.BALANCE_CACHE_TTL
      });
      return balance;
    } catch (error) {
      logger.errorWithContext('Failed to get wallet balance', error);
      
      // Return cached balance if available, even if expired
      if (this.cachedBalance) {
        logger.warn('Using expired cached balance due to RPC error', { 
          age: now - this.lastBalanceUpdate 
        });
        return this.cachedBalance;
      }
      
      throw error;
    }
  }

  async getBalanceHistory(limit?: number): Promise<(WalletBalance & { timestamp: number })[]> {
    // Return a copy of the balance history to prevent external modifications
    const history = [...this.balanceHistory];
    
    // Sort by timestamp to ensure chronological order
    history.sort((a, b) => a.timestamp - b.timestamp);
    
    // If limit is specified, return only the last N entries
    if (limit && limit > 0) {
      return history.slice(-limit);
    }
    
    return history;
  }

  // Get balance history for a specific time range
  async getBalanceHistoryForRange(hours: number): Promise<(WalletBalance & { timestamp: number })[]> {
    const now = Date.now();
    const startTime = now - (hours * 60 * 60 * 1000);
    
    return this.balanceHistory
      .filter(entry => entry.timestamp >= startTime)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  // Add hourly balance snapshot to history (called by scheduler every hour)
  // Automatically compresses previous day's hourly data into daily averages
  async addHourlyBalanceSnapshot(): Promise<void> {
    try {
      // Get current balance (this doesn't add to history automatically anymore)
      const currentBalance = await this.getWalletBalance();
      const now = Date.now();
      
      // Add current hourly snapshot
      this.balanceHistory.push({
        sol: currentBalance.sol,
        usdc: currentBalance.usdc,
        timestamp: now
      });
      
      logger.info('Added hourly balance snapshot', {
        sol: currentBalance.sol.toFixed(6),
        usdc: currentBalance.usdc.toFixed(2),
        time: new Date(now).toISOString()
      });

      // Compress data older than 24 hours into daily averages
      await this.compressOldBalanceHistory();

      // Save the updated history
      await this.saveBalanceHistory();
      
      logger.info('Hourly balance snapshot completed', {
        totalEntries: this.balanceHistory.length,
        oldestEntry: this.balanceHistory.length > 0 ? new Date(this.balanceHistory[0].timestamp).toDateString() : 'none',
        newestEntry: this.balanceHistory.length > 0 ? new Date(this.balanceHistory[this.balanceHistory.length - 1].timestamp).toDateString() : 'none'
      });

    } catch (error) {
      logger.error('Failed to add hourly balance snapshot:', error);
    }
  }

  async createPosition(
    timeframe: Timeframe,
    side: 'BUY' | 'SELL',
    amount: number
  ): Promise<Position> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    // Retry-Konfiguration für Slippage-Toleranz Fehler (Error 6004)
    const MAX_POSITION_RETRIES = 5;
    const RETRY_DELAY_MS = 2000; // 2 Sekunden zwischen Versuchen
    const BASE_SLIPPAGE = 3; // 3% Basis Slippage-Toleranz (Prozent, nicht BPS!)
    const SLIPPAGE_INCREMENT = 2; // Erhöhung um 2% pro Versuch
    
    // Reverse bin count strategy - start wide and narrow down on retries
    const INITIAL_BIN_COUNT = 60; // Start with wide liquidity distribution
    const BIN_COUNT_DECREMENT = 7; // Reduce bins per retry (60->53->46->39->32)
    const MIN_BIN_COUNT = 30; // Minimum bins for focused liquidity
    
    let currentSlippage = BASE_SLIPPAGE; // Variable außerhalb der Schleife definieren
    let targetBinCount = INITIAL_BIN_COUNT; // Initialize with maximum bin count
    
    for (let attempt = 1; attempt <= MAX_POSITION_RETRIES; attempt++) {
      try {

        const dlmm = this.dlmmPools.get(timeframe);
        if (!dlmm) {
          throw new Error(`DLMM pool not found for timeframe: ${timeframe}`);
        }
        // Berechne die Slippage-Toleranz für diesen Versuch (in Prozent für SDK)
        currentSlippage = BASE_SLIPPAGE + (SLIPPAGE_INCREMENT * (attempt - 1));
        
        const positionKeypair = Keypair.generate();
        const positionId = positionKeypair.publicKey.toString();

        // Get active bin for range calculation and validate pool state
        const activeBin = await dlmm.getActiveBin();
        const currentPrice = parseFloat(dlmm.fromPricePerLamport(Number(activeBin.price)));
        
        logger.trading(`Creating ${side} position for ${timeframe}`, {
          positionId: positionId.slice(0, 8),
          activeBinId: activeBin.binId,
          currentPrice,
          amount,
          amountType: side === 'BUY' ? 'SOL' : 'USDC'
        });

        // Validate minimum amounts before proceeding
        const MIN_SOL_AMOUNT = 0.001; // 0.001 SOL minimum
        const MIN_USDC_AMOUNT = 0.1;  // 0.1 USDC minimum
        
        if (side === 'BUY' && amount < MIN_SOL_AMOUNT) {
          throw new Error(`BUY position requires minimum ${MIN_SOL_AMOUNT} SOL, got ${amount}`);
        }
        if (side === 'SELL' && amount < MIN_USDC_AMOUNT) {
          throw new Error(`SELL position requires minimum ${MIN_USDC_AMOUNT} USDC, got ${amount}`);
        }

        // Calculate dynamic bin count based on attempt number and timeframe volatility
        // Higher frequency timeframes need tighter ranges due to more volatility
        let initialBinCount: number;
        let minBinCount: number;
        
        switch (timeframe) {
          case '1m':
            initialBinCount = 45; // Tighter for high volatility
            minBinCount = 25;
            break;
          case '15m':
            initialBinCount = 55; // Moderate range
            minBinCount = 30;
            break;
          default:
            initialBinCount = INITIAL_BIN_COUNT; // 60 for longer timeframes
            minBinCount = MIN_BIN_COUNT; // 30
        }
        
        targetBinCount = Math.max(
          initialBinCount - (BIN_COUNT_DECREMENT * (attempt - 1)),
          minBinCount
        );
        
        logger.trading(`Creating position attempt ${attempt}/${MAX_POSITION_RETRIES}`, {
          timeframe,
          side,
          amount,
          slippageTolerance: `${currentSlippage}%`,
          reverseBinStrategy: {
            timeframeOptimized: timeframe === '1m' || timeframe === '15m',
            initialBinCount: timeframe === '1m' ? 45 : timeframe === '15m' ? 55 : INITIAL_BIN_COUNT,
            targetBinCount,
            minBinCount: timeframe === '1m' ? 25 : timeframe === '15m' ? 30 : MIN_BIN_COUNT,
            strategy: 'Timeframe-optimized bin counts, narrow down on slippage errors',
            binReduction: `Attempt ${attempt}: ${targetBinCount} bins`,
            slippageProgression: `${BASE_SLIPPAGE}% + ${SLIPPAGE_INCREMENT * (attempt - 1)}% = ${currentSlippage}%`
          }
        });
        
        let minBinId: number;
        let maxBinId: number;
        let totalXAmount: BN; // SOL
        let totalYAmount: BN; // USDC

        if (side === 'BUY') {
          // BUY = SOL positioned ABOVE current price (upward liquidity)
          minBinId = activeBin.binId; // Start at current bin (SDK style)
          maxBinId = activeBin.binId + targetBinCount; // Conservative bins above
          
          // For BUY position: amount is SOL amount
          const solAmount = amount;
          totalXAmount = new BN(Math.floor(solAmount * 1e9)); // SOL amount in lamports, rounded down
          totalYAmount = new BN(0); // 0 USDC - we're providing SOL only (one-side)
          
          const expectedUsdc = solAmount * currentPrice;
          
          logger.trading(`BUY position: SOL distributed on ${targetBinCount} bins ABOVE current price`, {
            binRange: `${minBinId} to ${maxBinId}`,
            solAmount: solAmount,
            solLamports: totalXAmount.toString(),
            expectedUsdcReceived: expectedUsdc,
            currentPrice,
            totalBins: maxBinId - minBinId + 1,
            conservativeStrategy: true,
            attempt
          });
          
        } else {
          // SELL = USDC positioned BELOW current price (downward liquidity)
          maxBinId = activeBin.binId; // End at current bin (SDK style)
          minBinId = activeBin.binId - targetBinCount; // Conservative bins below
          
          // For SELL position: amount is USDC amount
          const usdcAmount = amount;
          totalXAmount = new BN(0); // 0 SOL - we're providing USDC only (one-side)
          totalYAmount = new BN(Math.floor(usdcAmount * 1e6)); // USDC amount in micro-USDC, rounded down
          
          const expectedSol = usdcAmount / currentPrice;
          
          logger.trading(`SELL position: USDC distributed on ${targetBinCount} bins BELOW current price`, {
            binRange: `${minBinId} to ${maxBinId}`,
            usdcAmount: usdcAmount,
            usdcMicroUnits: totalYAmount.toString(),
            expectedSolReceived: expectedSol,
            currentPrice,
            totalBins: maxBinId - minBinId + 1,
            conservativeStrategy: true,
            attempt
          });
        }

        // Validate bin range is reasonable
        if (minBinId >= maxBinId) {
          throw new Error(`Invalid bin range: minBinId ${minBinId} >= maxBinId ${maxBinId}`);
        }

        // Create strategy parameters with environment-configurable strategy type
        const strategy = {
          maxBinId,
          minBinId,
          strategyType: getStrategyType(timeframe),
        };

        // Check wallet balance before creating position
        const balance = await this.getWalletBalance();
        const tokenConfig = getTokenConfig();
        
        if (side === 'BUY' && balance.sol < amount) {
          throw new Error(`Insufficient ${tokenConfig.baseTokenSymbol} balance: need ${amount}, have ${balance.sol}`);
        }
        if (side === 'SELL' && balance.usdc < amount) {
          throw new Error(`Insufficient ${tokenConfig.quoteTokenSymbol} balance: need ${amount}, have ${balance.usdc}`);
        }

        logger.trading('Creating Meteora position transaction...', {
          positionId: positionId.slice(0, 8),
          strategy,
          totalXAmount: totalXAmount.toString(),
          totalYAmount: totalYAmount.toString(),
          slippageTolerance: `${currentSlippage}%`,
          binCount: targetBinCount,
          attempt,
          binRange: `${minBinId} to ${maxBinId}`
        });

        // Erst prüfen ob Bin Arrays initialisiert sind
        const binArrayIndexes: BN[] = [];
        const startArrayIndex = Math.floor(minBinId / 70); // 70 bins per array
        const endArrayIndex = Math.floor(maxBinId / 70);
        
        for (let i = startArrayIndex; i <= endArrayIndex; i++) {
          binArrayIndexes.push(new BN(i));
        }
        
        // Initialisiere Bin Arrays falls nötig
        try {
          const initInstructions = await dlmm.initializeBinArrays(binArrayIndexes, this.wallet!.publicKey);
          if (initInstructions.length > 0) {
            logger.trading('Initializing bin arrays before position creation', {
              arrayIndexes: binArrayIndexes.map(bn => bn.toString()),
              count: initInstructions.length
            });
          }
        } catch (binArrayError) {
          logger.warn('Bin array initialization failed (may already exist)', binArrayError);
          // Continue anyway - arrays may already exist
        }

        // Create position transaction - MIT SLIPPAGE PARAMETER!
        const transaction = await dlmm.initializePositionAndAddLiquidityByStrategy({
          positionPubKey: positionKeypair.publicKey,
          user: this.wallet!.publicKey,
          totalXAmount,
          totalYAmount,
          strategy,
          slippage: currentSlippage, // KRITISCH: Slippage parameter hinzugefügt!
        });

        // Sign and send transaction with retry logic
        logger.trading('Sending transaction to blockchain...', {
          positionId: positionId.slice(0, 8),
          bins: `${minBinId}-${maxBinId}`,
          strategy: getStrategyType(timeframe)
        });

        const signature = await this.sendTransactionWithRetry(
          transaction,
          [this.wallet!, positionKeypair],
          `Meteora position creation (${timeframe})`
        );

        // Calculate price range for position validity checks using DLMM SDK methods
        let minPrice: number, maxPrice: number;
        
        try {
          // CRITICAL FIX: Use correct DLMM SDK method to convert bin IDs to actual prices
          const poolConfigs = getPoolConfigFromEnv();
          const binStep = dlmm.lbPair?.binStep || poolConfigs[timeframe].binStep;
          
          // Get active bin for proper price calculation base
          const activeBin = await dlmm.getActiveBin();
          const activeBinId = activeBin.binId;
          const activeBinPrice = parseFloat(dlmm.fromPricePerLamport(activeBinId));
          
          // Calculate actual prices using logarithmic formula (not fromPricePerLamport which returns bin IDs!)
          const minPriceRatio = Math.log(Math.pow(1 + binStep / 10000, minBinId - activeBinId));
          const maxPriceRatio = Math.log(Math.pow(1 + binStep / 10000, maxBinId - activeBinId));
          
          const calculatedMinPrice = activeBinPrice * Math.exp(minPriceRatio);
          const calculatedMaxPrice = activeBinPrice * Math.exp(maxPriceRatio);
          
          minPrice = Math.min(calculatedMinPrice, calculatedMaxPrice);
          maxPrice = Math.max(calculatedMinPrice, calculatedMaxPrice);
          
          // Validate that we got reasonable price values (not bin IDs)
          if (minPrice < 1 || maxPrice < 1 || minPrice > 10000 || maxPrice > 10000) {
            throw new Error(`Calculated prices seem invalid: ${minPrice} - ${maxPrice}`);
          }
          
          logger.debug(`Calculated accurate price range using proper DLMM formula`, {
            side,
            binRange: `${minBinId} - ${maxBinId}`,
            priceRange: `${minPrice.toFixed(4)} - ${maxPrice.toFixed(4)}`,
            currentPrice,
            activeBinId,
            activeBinPrice,
            binStep
          });
          
        } catch (error) {
          logger.warn(`Failed to calculate accurate price range using DLMM SDK, using mathematical approximation:`, error);
          // Fallback to approximation if SDK methods fail
          const poolConfigs = getPoolConfigFromEnv();
          const binStep = poolConfigs[timeframe].binStep;
          const priceChangePerBin = currentPrice * (binStep / 10000);
          
          if (side === 'BUY') {
            minPrice = currentPrice;
            maxPrice = currentPrice + (priceChangePerBin * targetBinCount);
          } else {
            maxPrice = currentPrice;
            minPrice = currentPrice - (priceChangePerBin * targetBinCount);
          }
        }

        const poolConfigs = getPoolConfigFromEnv();
        const position: Position = {
          id: positionId,
          poolId: poolConfigs[timeframe].poolId,
          timeframe,
          side,
          amount,
          price: currentPrice,
          createdAt: Date.now(),
          status: 'ACTIVE',
          positionPubKey: positionKeypair.publicKey.toString(),
          priceRange: {
            minPrice: Math.min(minPrice, maxPrice),
            maxPrice: Math.max(minPrice, maxPrice),
            binRange: {
              minBinId,
              maxBinId
            }
          }
        };

        this.positions.set(positionId, position);
        await this.savePositions();
        
        logger.info('Meteora position created successfully with reverse bin strategy', {
          positionId,
          timeframe,
          side,
          amount,
          amountType: side === 'BUY' ? 'SOL' : 'USDC',
          strategy: side === 'BUY' ? 'SOL-liquidity-above-price' : 'USDC-liquidity-below-price',
          binRange: `${minBinId}-${maxBinId}`,
          currentPrice,
          signature,
          attempt,
          slippageTolerance: currentSlippage,
          finalSlippageUsed: `${currentSlippage}%`,
          reverseBinStrategy: {
            finalBinCount: targetBinCount,
            initialBinCount: INITIAL_BIN_COUNT, // Always 60
            minBinCount: MIN_BIN_COUNT,
            successfulOnAttempt: attempt,
            allTimeframesStart60: true,
            strategy: 'All timeframes start at 60 bins, narrowed as needed'
          }
        });

        return position;

      } catch (error: any) {
        // Prüfe spezifisch auf "ExceededBinSlippageTolerance" Error 6004
        const isSlippageError = error.message?.includes('Custom: 6004') || 
                              error.message?.includes('ExceededBinSlippageTolerance') ||
                              error.message?.includes('custom program error: 0x1774');

        if (isSlippageError && attempt < MAX_POSITION_RETRIES) {
          const nextSlippage = BASE_SLIPPAGE + (SLIPPAGE_INCREMENT * attempt);
          const nextBinCount = Math.max(INITIAL_BIN_COUNT - (BIN_COUNT_DECREMENT * attempt), MIN_BIN_COUNT);
          
          // Exponential backoff for retry delay
          const retryDelay = RETRY_DELAY_MS * Math.pow(1.5, attempt - 1);
          
          logger.warn(`Reverse bin strategy retry (attempt ${attempt}/${MAX_POSITION_RETRIES}) - narrowing bins and increasing slippage`, {
            error: error.message,
            timeframe,
            side,
            amount,
            attempt,
            reverseBinAdjustments: {
              currentBinCount: targetBinCount,
              nextBinCount,
              currentSlippage: `${currentSlippage}%`,
              nextSlippage: `${nextSlippage}%`,
              retryDelayMs: retryDelay,
              strategy: 'All timeframes start at 60 bins, narrow down on slippage errors'
            },
            willRetry: true
          });

          // Warte vor dem nächsten Versuch mit exponential backoff
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue; // Nächster Versuch in der for-Schleife
        }

        // Andere Fehler oder maximale Versuche erreicht
        if (isSlippageError) {
          logger.error(`Failed to create position after ${MAX_POSITION_RETRIES} attempts due to slippage`, {
            timeframe,
            side,
            amount,
            attempts: MAX_POSITION_RETRIES,
            finalError: error.message,
            slippageProgression: {
              baseSlippage: BASE_SLIPPAGE,
              increment: SLIPPAGE_INCREMENT,
              maxSlippageReached: currentSlippage,
              allSlippageValues: Array.from({length: MAX_POSITION_RETRIES}, (_, i) => BASE_SLIPPAGE + (SLIPPAGE_INCREMENT * i))
            }
          });
        } else {
          // Nicht-Slippage Fehler - sofort fehlschlagen
          logger.error('Failed to create Meteora position (non-slippage error):', {
            error: error.message,
            timeframe,
            side,
            amount,
            attempt
          });
        }

        // Enhanced error handling für verschiedene Meteora-spezifische Fehler
        if (error.message?.includes('Custom: 6004')) {
          logger.error('Meteora Error 6004 - ExceededBinSlippageTolerance:', {
            explanation: 'Price moved too much during transaction execution',
            possibleCauses: [
              'High market volatility',
              'Network congestion causing delays',
              'Large slippage between transaction creation and execution',
              'Current price moved outside the configured bin range'
            ],
            side,
            amount,
            timeframe,
            attempts: attempt,
            reverseBinStrategy: {
              initialBinCount: INITIAL_BIN_COUNT, // Always 60
              currentBinCount: targetBinCount,
              minBinCount: MIN_BIN_COUNT,
              binDecrement: BIN_COUNT_DECREMENT,
              strategy: 'All timeframes start at 60 bins, narrowed down due to slippage'
            },
            slippageProgression: {
              baseSlippage: BASE_SLIPPAGE,
              increment: SLIPPAGE_INCREMENT,
              finalSlippage: currentSlippage,
              allAttempts: Array.from({length: attempt}, (_, i) => BASE_SLIPPAGE + (SLIPPAGE_INCREMENT * i))
            }
          });
        }
        
        throw error;
      }
    }

    // Wenn wir hier ankommen, haben alle Versuche fehlgeschlagen
    throw new Error(`Failed to create position after ${MAX_POSITION_RETRIES} attempts`);
  }

  // Hilfsmethode: Prüft ob aktuelle Position noch im gültigen Preisbereich ist
  isPositionInValidRange(position: Position, currentPrice: number): boolean {
    if (!position.priceRange) {
      // Alte Positionen ohne priceRange sind immer ungültig (sollen geschlossen werden)
      logger.position(`Position ${position.id.slice(0, 8)} has no priceRange - marking as invalid`);
      return false;
    }

    // Check if enough time has passed since last range check based on timeframe
    const now = Date.now();
    const lastCheck = position.lastRangeCheck || position.createdAt;
    const timeSinceLastCheck = now - lastCheck;
    
    // Define minimum intervals between range checks (in milliseconds)
    const timeframeIntervals: { [key: string]: number } = {
      '1m': 60 * 1000,        // 1 minute
      '15m': 15 * 60 * 1000,  // 15 minutes  
      '1h': 60 * 60 * 1000,   // 1 hour
      '4h': 4 * 60 * 60 * 1000, // 4 hours
      '1d': 24 * 60 * 60 * 1000 // 24 hours
    };
    
    const requiredInterval = timeframeIntervals[position.timeframe] || 5 * 60 * 1000; // Default 5 minutes
    
    if (timeSinceLastCheck < requiredInterval) {
      logger.debug(`Position ${position.id.slice(0, 8)} range check skipped - not enough time passed`, {
        timeframe: position.timeframe,
        timeSinceLastCheck: Math.round(timeSinceLastCheck / 1000) + 's',
        requiredInterval: Math.round(requiredInterval / 1000) + 's',
        timeRemaining: Math.round((requiredInterval - timeSinceLastCheck) / 1000) + 's'
      });
      return true; // Assume position is still valid if not enough time has passed
    }

    const { minPrice, maxPrice } = position.priceRange;
    
    // Validate that we have valid price data (not bin IDs mistaken as prices)
    const isValidPriceRange = minPrice > 0 && maxPrice > 0 && minPrice < 10000 && maxPrice < 10000;
    if (!isValidPriceRange) {
      logger.error(`Invalid price range detected in position ${position.id.slice(0, 8)} - likely corrupted data`, {
        minPrice,
        maxPrice,
        currentPrice,
        positionId: position.id.slice(0, 8),
        reason: 'Price values seem to be bin IDs instead of actual prices'
      });
      // Mark position as invalid for closure
      return false;
    }
    
    // Timeframe-basierte Buffer um vorzeitiges Schließen zu verhindern
    const bufferPercentages: { [key: string]: number } = {
      '1m': 0.02,   // 2%
      '15m': 0.05,  // 5%
      '1h': 0.08,   // 8%
      '4h': 0.12,   // 12%
      '1d': 0.20    // 20%
    };
    
    const bufferPercent = bufferPercentages[position.timeframe] || 0.05; // Default 5%
    const priceRange = maxPrice - minPrice;
    const buffer = priceRange * bufferPercent;
    
    // Erweiterte Range mit Buffer
    const bufferedMinPrice = minPrice - buffer;
    const bufferedMaxPrice = maxPrice + buffer;
    
    const isInRange = currentPrice >= bufferedMinPrice && currentPrice <= bufferedMaxPrice;
    
    // Update last range check timestamp
    position.lastRangeCheck = now;
    
    logger.debug(`Position ${position.id.slice(0, 8)} range check with ${(bufferPercent * 100).toFixed(1)}% buffer (${position.timeframe} interval)`, {
      currentPrice,
      originalRange: `${minPrice.toFixed(4)} - ${maxPrice.toFixed(4)}`,
      bufferedRange: `${bufferedMinPrice.toFixed(4)} - ${bufferedMaxPrice.toFixed(4)}`,
      buffer: buffer.toFixed(4),
      isInRange,
      side: position.side,
      timeframe: position.timeframe,
      timeSinceLastCheck: Math.round(timeSinceLastCheck / 1000) + 's',
      rangeCheckPerformed: true
    });
    
    // Update last range check timestamp and save position
    position.lastRangeCheck = now;
    this.positions.set(position.id, position);
    // Save positions asynchronously without blocking
    this.savePositions().catch(error => 
      logger.error('Failed to save position after range check update:', error)
    );
    
    return isInRange;
  }

  async closePosition(positionId: string, force: boolean = false): Promise<{ 
    baseTokenReceived: number, 
    quoteTokenReceived: number, 
    baseTokenSymbol: string, 
    quoteTokenSymbol: string 
  } | void> {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error(`Position not found: ${positionId}`);
    }

    // Check if position is already being closed
    if (this.closingPositions.has(positionId)) {
      logger.warn(`Position ${positionId.slice(0, 8)} is already being closed, skipping duplicate request`);
      return;
    }

    // Mark position as being closed
    this.closingPositions.add(positionId);

    try {
      if (!this.wallet) {
        throw new Error('Wallet not initialized');
      }

      const dlmm = this.dlmmPools.get(position.timeframe);
      if (!dlmm) {
        if (force) {
          logger.warn(`DLMM pool not found for ${position.timeframe}, force closing position in memory only`);
          position.status = 'CLOSED';
          await this.savePositions();
          return;
        }
        throw new Error(`DLMM pool not found for timeframe: ${position.timeframe}`);
      }

      if (!position.positionPubKey) {
        if (force) {
          logger.warn(`Position ${positionId.slice(0, 8)} has no positionPubKey, force closing in memory only`);
          position.status = 'CLOSED';
          await this.savePositions();
          return;
        }
        throw new Error(`Position ${positionId} has no positionPubKey`);
      }

      const positionPubKey = new PublicKey(position.positionPubKey);
      
      // Get token configuration
      const tokenConfig = getTokenConfig();
      
      // Get wallet balance before closing to calculate received tokens
      const balanceBefore = await this.getWalletBalance();
      
      // Check if this position was previously harvested
      const hasBeenHarvested = (position as any).hasBeenHarvested === true;
      
      logger.position(`Closing position ${positionId.slice(0, 8)}`, {
        timeframe: position.timeframe,
        side: position.side,
        amount: position.amount,
        force: force,
        hasBeenHarvested: hasBeenHarvested,
        harvestStatus: hasBeenHarvested ? 'Previously harvested - may need special handling' : 'No previous harvesting'
      });

      // Check if position still exists on blockchain
      const accountInfo = await this.connection.getAccountInfo(positionPubKey);
      if (!accountInfo || !accountInfo.data || accountInfo.data.length === 0) {
        logger.warn(`Position ${positionId.slice(0, 8)} already closed on blockchain, updating status only`);
        position.status = 'CLOSED';
        await this.savePositions();
        return;
      }

      // First remove liquidity, then close the position
      logger.position(`Closing position ${positionId.slice(0, 8)} - removing liquidity first`);
      
      try {
        // First get the LbPosition object from the position public key
        const lbPosition = await dlmm.getPosition(positionPubKey);
        
        // Get the actual bin range from the position
        const positionData = lbPosition.positionData;
        const lowerBinId = positionData.lowerBinId;
        const upperBinId = positionData.upperBinId;
        
        logger.position(`Removing liquidity from position ${positionId.slice(0, 8)}, bin range: ${lowerBinId} to ${upperBinId}`);
        
        // CRITICAL FIX: Check if this position was previously harvested and might have partial liquidity
        // For harvested positions, we need to ensure ALL remaining liquidity is removed
        logger.position(`Checking for remaining liquidity in position ${positionId.slice(0, 8)} (may have been harvested)`);
        
        // STEP 1: Remove ALL liquidity first with extremely wide bin range
        // This covers harvested positions and any edge cases with liquidity distribution
        const LIQUIDITY_BUFFER = 200; // Expand by 200 bins in each direction to be absolutely sure
        const expandedLowerBinId = lowerBinId - LIQUIDITY_BUFFER;
        const expandedUpperBinId = upperBinId + LIQUIDITY_BUFFER;
        
        logger.position(`STEP 1: Removing ALL liquidity with extremely wide bin range`, {
          originalRange: `${lowerBinId} to ${upperBinId}`,
          expandedRange: `${expandedLowerBinId} to ${expandedUpperBinId}`,
          buffer: LIQUIDITY_BUFFER,
          reason: 'Covering all possible liquidity distribution scenarios'
        });
        
        try {
          // Get current position data to determine exact bin range
          const currentLbPosition = await dlmm.getPosition(positionPubKey);
          const currentPositionData = currentLbPosition.positionData;
          
          logger.position(`Current position data for ${positionId.slice(0, 8)}:`, {
            lowerBinId: currentPositionData.lowerBinId,
            upperBinId: currentPositionData.upperBinId,
            lastUpdatedAt: currentPositionData.lastUpdatedAt?.toString() || '0'
          });

          const removeLiquidityTx = await dlmm.removeLiquidity({
            user: this.wallet.publicKey,
            position: positionPubKey,
            fromBinId: expandedLowerBinId, // Extremely wide range
            toBinId: expandedUpperBinId,   // Extremely wide range  
            bps: new BN(10000), // Remove 100%
            shouldClaimAndClose: false // DON'T auto-close yet - handle manually
          });

          // Execute remove liquidity transaction(s)
          if (Array.isArray(removeLiquidityTx)) {
            logger.position(`Executing ${removeLiquidityTx.length} transactions to remove ALL liquidity`);
            for (let i = 0; i < removeLiquidityTx.length; i++) {
              const tx = removeLiquidityTx[i];
              logger.position(`Sending liquidity removal transaction ${i + 1}/${removeLiquidityTx.length}`);
              await sendAndConfirmTransaction(this.connection, tx, [this.wallet!], {
                commitment: 'confirmed',
                skipPreflight: false,
                preflightCommitment: 'confirmed'
              });
            }
          } else if (removeLiquidityTx) {
            logger.position(`Sending single transaction to remove ALL liquidity`);
            await sendAndConfirmTransaction(this.connection, removeLiquidityTx, [this.wallet!], {
              commitment: 'confirmed',
              skipPreflight: false,
              preflightCommitment: 'confirmed'
            });
          } else {
            logger.position(`No liquidity removal transactions returned - position might already be empty`);
          }
        } catch (liquidityError: any) {
          // Handle case where no liquidity exists to remove (e.g., already harvested)
          if (liquidityError.message?.includes('No liquidity to remove') || 
              liquidityError.message?.includes('liquidity') || 
              liquidityError.message?.includes('empty')) {
            logger.position(`Position ${positionId.slice(0, 8)} has no liquidity to remove (already harvested/empty) - proceeding to close`);
          } else {
            logger.warn(`Liquidity removal failed for position ${positionId.slice(0, 8)}:`, liquidityError.message);
          }
          // Continue with the closing process regardless of liquidity removal outcome
        }

        // Wait for blockchain state to update after liquidity removal
        logger.position(`Waiting for blockchain state to update after liquidity removal`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        
        // STEP 2: Get updated position and claim ALL rewards and fees
        logger.position(`STEP 2: Claiming ALL rewards and swap fees after liquidity removal`);
        try {
          // Get fresh position data after liquidity removal
          const updatedLbPosition = await dlmm.getPosition(positionPubKey);
          
          // Use the new claimAllRewardsByPosition method to claim both LM rewards AND swap fees
          const claimAllTxs = await dlmm.claimAllRewardsByPosition({
            owner: this.wallet.publicKey,
            position: updatedLbPosition
          });
          
          if (claimAllTxs && claimAllTxs.length > 0) {
            logger.position(`Claiming all rewards and fees (${claimAllTxs.length} transactions)`);
            for (let i = 0; i < claimAllTxs.length; i++) {
              const tx = claimAllTxs[i];
              logger.position(`Sending claim transaction ${i + 1}/${claimAllTxs.length}`);
              await sendAndConfirmTransaction(this.connection, tx, [this.wallet!], {
                commitment: 'confirmed',
                skipPreflight: false,
                preflightCommitment: 'confirmed'
              });
            }
            logger.position(`Successfully claimed all rewards and fees`);
          } else {
            logger.position(`No rewards or fees to claim`);
          }
        } catch (claimError) {
          logger.position(`No rewards/fees to claim (this is normal):`, claimError);
        }

        // Wait for blockchain state to update after claiming
        logger.position(`Waiting for blockchain state to update after claiming fees`);
        await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 second delay

        // STEP 3: NOW close the position account
        logger.position(`STEP 3: Attempting to close position account ${positionId.slice(0, 8)}`);
        
        try {
          // Get final fresh position data after liquidity removal and fee claiming
          const finalLbPosition = await dlmm.getPosition(positionPubKey);
          
          // Check if position is actually empty
          const positionData = finalLbPosition.positionData;
          logger.position(`Final position validation before closing ${positionId.slice(0, 8)}`, {
            lowerBinId: positionData.lowerBinId,
            upperBinId: positionData.upperBinId,
            lastUpdatedAt: positionData.lastUpdatedAt?.toString() || '0',
            owner: positionData.owner?.toString() || 'none',
            positionDataAvailable: 'Position should be completely empty after liquidity removal and fee claiming'
          });

          // Validate position is empty by checking user positions from pair
          const userPositions = await dlmm.getPositionsByUserAndLbPair(this.wallet.publicKey);
          const currentPosition = userPositions.userPositions.find(pos => 
            pos.publicKey.toString() === positionPubKey.toString()
          );

          if (currentPosition) {
            logger.position(`Position still exists with data:`, {
              positionId: positionId.slice(0, 8),
              binIds: `${currentPosition.positionData.lowerBinId} to ${currentPosition.positionData.upperBinId}`,
              lastUpdatedAt: currentPosition.positionData.lastUpdatedAt?.toString() || '0',
              status: 'Position still has data after liquidity removal'
            });

            // Try one more aggressive liquidity removal 
            logger.position(`Attempting final aggressive liquidity removal for ${positionId.slice(0, 8)}`);
            try {
              const finalRemovalTx = await dlmm.removeLiquidity({
                user: this.wallet.publicKey,
                position: positionPubKey,
                fromBinId: currentPosition.positionData.lowerBinId - 50,
                toBinId: currentPosition.positionData.upperBinId + 50,
                bps: new BN(10000), // 100%
                shouldClaimAndClose: false
              });

              if (finalRemovalTx) {
                if (Array.isArray(finalRemovalTx)) {
                  for (const tx of finalRemovalTx) {
                    await sendAndConfirmTransaction(this.connection, tx, [this.wallet!], {
                      commitment: 'confirmed',
                      skipPreflight: false
                    });
                  }
                } else {
                  await sendAndConfirmTransaction(this.connection, finalRemovalTx, [this.wallet!], {
                    commitment: 'confirmed',
                    skipPreflight: false
                  });
                }
                
                // Wait for state update
                await new Promise(resolve => setTimeout(resolve, 3000));
              }
            } catch (finalRemovalError) {
              logger.position(`Final liquidity removal failed (continuing anyway):`, finalRemovalError);
            }
          }
          
          logger.position(`Position ${positionId.slice(0, 8)} liquidity removed and fees claimed, attempting final closure`);
          
          // Try to close with the final updated position data
          const closePositionTx = await dlmm.closePosition({
            owner: this.wallet.publicKey,
            position: finalLbPosition,
          });

          if (Array.isArray(closePositionTx)) {
            logger.position(`Executing ${closePositionTx.length} transactions to close position account`);
            for (let i = 0; i < closePositionTx.length; i++) {
              const tx = closePositionTx[i];
              logger.position(`Sending close position transaction ${i + 1}/${closePositionTx.length}`);
              await sendAndConfirmTransaction(this.connection, tx, [this.wallet!], {
                commitment: 'confirmed',
                skipPreflight: false,
                preflightCommitment: 'confirmed'
              });
            }
          } else if (closePositionTx) {
            logger.position(`Sending single close position transaction`);
            await sendAndConfirmTransaction(this.connection, closePositionTx, [this.wallet!], {
              commitment: 'confirmed',
              skipPreflight: false,
              preflightCommitment: 'confirmed'
            });
          } else {
            logger.warn(`No close position transaction returned for ${positionId.slice(0, 8)} - position might already be closed`);
          }
          
          logger.position(`✅ Successfully closed position account ${positionId.slice(0, 8)}`);
          
        } catch (closeError: any) {
          // Enhanced error handling for the specific NonEmptyPosition error
          if (closeError.message?.includes('NonEmptyPosition') || 
              closeError.message?.includes('6030') || 
              closeError.message?.includes('0x178e') ||
              closeError.message?.includes('custom program error: 0x178e')) {
            
            logger.warn(`Position ${positionId.slice(0, 8)} STILL contains data after comprehensive cleanup`, {
              error: 'NonEmptyPosition (6030) - Position Not Empty',
              explanation: 'Position still has some form of data that prevents closure despite aggressive cleanup',
              action: 'This is a known Meteora SDK edge case - attempting alternative closure method',
              positionId: positionId.slice(0, 8)
            });

            // Try alternative approach: Use shouldClaimAndClose=true in removeLiquidity
            try {
              logger.position(`Attempting alternative closure with shouldClaimAndClose=true for ${positionId.slice(0, 8)}`);
              
              const alternativeClosureTx = await dlmm.removeLiquidity({
                user: this.wallet.publicKey,
                position: positionPubKey,
                fromBinId: -500, // Very wide range
                toBinId: 500,   // Very wide range
                bps: new BN(10000), // 100%
                shouldClaimAndClose: true // Let SDK handle everything
              });

              if (alternativeClosureTx) {
                if (Array.isArray(alternativeClosureTx)) {
                  for (const tx of alternativeClosureTx) {
                    await sendAndConfirmTransaction(this.connection, tx, [this.wallet!], {
                      commitment: 'confirmed',
                      skipPreflight: false
                    });
                  }
                } else {
                  await sendAndConfirmTransaction(this.connection, alternativeClosureTx, [this.wallet!], {
                    commitment: 'confirmed',
                    skipPreflight: false
                  });
                }
                logger.position(`✅ Successfully closed position ${positionId.slice(0, 8)} using alternative method`);
              } else {
                throw new Error('Alternative closure method returned no transaction');
              }
              
            } catch (alternativeError: any) {
              logger.warn(`Alternative closure method also failed for ${positionId.slice(0, 8)}:`, alternativeError.message);
              
              // Final fallback: Mark as closed in memory only
              logger.warn(`Marking position ${positionId.slice(0, 8)} as closed in memory - this is a known Meteora SDK edge case`);
            }
            
          } else {
            logger.warn(`Failed to close position account ${positionId.slice(0, 8)}, but continuing:`, closeError);
          }
          // Don't throw error here - position might already be closed or have no rent to recover
        }
      } catch (closePositionError: any) {
        if (force) {
          logger.warn(`Failed to close position but force=true, marking position as closed anyway`, {
            error: closePositionError.message,
            positionId: positionId.slice(0, 8)
          });
        } else {
          throw closePositionError;
        }
      }

      position.status = 'CLOSED';
      await this.savePositions();
      
      // Calculate received tokens by comparing balances
      const balanceAfter = await this.getWalletBalance();
      const baseTokenReceived = balanceAfter.sol - balanceBefore.sol;
      const quoteTokenReceived = balanceAfter.usdc - balanceBefore.usdc;
      
      logger.info('Position closed successfully', { 
        positionId: positionId.slice(0, 8),
        timeframe: position.timeframe,
        side: position.side,
        previousAmount: position.amount,
        tokensReceived: {
          [tokenConfig.baseTokenSymbol]: baseTokenReceived.toFixed(6),
          [tokenConfig.quoteTokenSymbol]: quoteTokenReceived.toFixed(6)
        },
        forced: force
      });

      return {
        baseTokenReceived,
        quoteTokenReceived,
        baseTokenSymbol: tokenConfig.baseTokenSymbol,
        quoteTokenSymbol: tokenConfig.quoteTokenSymbol
      };
    } catch (error: any) {
      // Enhanced error handling for position closing
      if (error.message?.includes('Cannot read properties of null') && force) {
        logger.warn(`Position ${positionId.slice(0, 8)} has null data but force=true - marking as closed`);
        position.status = 'CLOSED';
        await this.savePositions();
        return;
      }
      
      if (force) {
        logger.warn(`Force closing position ${positionId.slice(0, 8)} due to error`, {
          error: error.message
        });
        position.status = 'CLOSED';
        await this.savePositions();
        return;
      }
      
      logger.error('Failed to close position:', error);
      throw error;
    } finally {
      // Always remove from closing set when done (success or failure)
      this.closingPositions.delete(positionId);
    }
  }

  getPositions(limit?: number, order: 'asc' | 'desc' = 'desc'): Position[] {
    let positions = Array.from(this.positions.values());
    
    // Sort positions by createdAt
    positions.sort((a, b) => {
      if (order === 'desc') {
        return b.createdAt - a.createdAt; // Newest first
      } else {
        return a.createdAt - b.createdAt; // Oldest first
      }
    });
    
    // Apply limit if specified
    if (limit && limit > 0) {
      positions = positions.slice(0, limit);
    }
    
    return positions;
  }

  // Public method to manually sync positions with blockchain
  async syncPositions(): Promise<{ updated: number; total: number }> {
    await this.syncPositionsWithBlockchain();
    const activePositions = Array.from(this.positions.values())
      .filter(p => p.status === 'ACTIVE');
    const totalPositions = this.positions.size;
    
    return {
      updated: totalPositions - activePositions.length,
      total: totalPositions
    };
  }

  getConfig(): TradingConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<TradingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Trading config updated', { config: this.config });
  }

  // Getter methods for SchedulerService bin harvesting
  getDLMMPool(timeframe: Timeframe): DLMM | null {
    return this.dlmmPools.get(timeframe) || null;
  }

  getWallet(): Keypair | null {
    return this.wallet;
  }

  getConnection(): Connection {
    return this.connection;
  }

  async updatePositionRange(positionId: string, newRange: { minPrice: number; maxPrice: number }): Promise<void> {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    // Get DLMM pool to calculate accurate bin IDs
    const dlmm = this.dlmmPools.get(position.timeframe);
    if (!dlmm) {
      throw new Error(`DLMM pool not found for timeframe: ${position.timeframe}`);
    }

    // Calculate new bin range dynamically using DLMM SDK
    let newMinBinId: number;
    let newMaxBinId: number;
    
    try {
      const activeBin = await dlmm.getActiveBin();
      const activeBinId = activeBin.binId;
      const binStep = dlmm.lbPair?.binStep || 10; // fallback binStep
      
      // Use DLMM logarithmic formula to convert prices to bin IDs
      const minPriceRatio = Math.log(newRange.minPrice / parseFloat(dlmm.fromPricePerLamport(activeBinId))) / Math.log(1 + binStep / 10000);
      const maxPriceRatio = Math.log(newRange.maxPrice / parseFloat(dlmm.fromPricePerLamport(activeBinId))) / Math.log(1 + binStep / 10000);
      
      newMinBinId = Math.round(activeBinId + minPriceRatio);
      newMaxBinId = Math.round(activeBinId + maxPriceRatio);
      
      logger.debug(`Calculated new bin range for position ${positionId.slice(0, 8)}`, {
        newMinPrice: newRange.minPrice,
        newMaxPrice: newRange.maxPrice,
        activeBinId,
        newMinBinId,
        newMaxBinId,
        binStep
      });
      
    } catch (error) {
      logger.warn(`Failed to calculate dynamic bin IDs, using existing range:`, error);
      // Fallback to existing bin range if calculation fails - but keep the PRICE values correct!
      const existingBinRange = position.priceRange?.binRange || { minBinId: 0, maxBinId: 0 };
      newMinBinId = existingBinRange.minBinId;
      newMaxBinId = existingBinRange.maxBinId;
      
      // CRITICAL: Don't let bin IDs corrupt the price values!
      logger.warn(`Using fallback bin IDs (${newMinBinId}, ${newMaxBinId}) but preserving new price range (${newRange.minPrice}, ${newRange.maxPrice})`);
    }
    
    position.priceRange = {
      minPrice: newRange.minPrice,
      maxPrice: newRange.maxPrice,
      binRange: {
        minBinId: newMinBinId,
        maxBinId: newMaxBinId
      }
    };

    // Save updated position to storage
    this.positions.set(positionId, position);
    await this.savePositions();

    logger.info(`Updated position ${positionId.slice(0, 8)} range`, {
      newPriceRange: `${newRange.minPrice} - ${newRange.maxPrice}`,
      newBinRange: `${newMinBinId} - ${newMaxBinId}`
    });
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down trading service...');
    
    // Harvest rewards from active positions before shutdown
    const activePositions = Array.from(this.positions.values())
      .filter(p => p.status === 'ACTIVE');
    
    if (activePositions.length > 0) {
      logger.info(`Attempting to harvest rewards from ${activePositions.length} active positions before shutdown`);
      
      for (const position of activePositions) {
        try {
          const dlmm = this.dlmmPools.get(position.timeframe);
          if (!dlmm || !position.positionPubKey) {
            logger.warn(`Cannot harvest rewards for position ${position.id.slice(0, 8)}: missing DLMM pool or positionPubKey`);
            continue;
          }
          
          const positionPubKey = new PublicKey(position.positionPubKey);
          
          // Try to claim rewards without closing position
          try {
            const lbPosition = await dlmm.getPosition(positionPubKey);
            const claimTx = await dlmm.claimLMReward({
              owner: this.wallet!.publicKey,
              position: lbPosition
            });
            
            if (claimTx) {
              if (Array.isArray(claimTx)) {
                for (const tx of claimTx) {
                  await sendAndConfirmTransaction(this.connection, tx, [this.wallet!], {
                    commitment: 'confirmed'
                  });
                }
                logger.info(`Harvested rewards from position ${position.id.slice(0, 8)} (${claimTx.length} transactions)`);
              } else {
                await sendAndConfirmTransaction(this.connection, claimTx, [this.wallet!], {
                  commitment: 'confirmed'
                });
                logger.info(`Harvested rewards from position ${position.id.slice(0, 8)}`);
              }
            }
          } catch (rewardError) {
            logger.warn(`No rewards to claim for position ${position.id.slice(0, 8)}:`, rewardError);
          }
        } catch (error) {
          logger.error(`Failed to harvest rewards for position ${position.id.slice(0, 8)}:`, error);
        }
      }
    }
    
    // Save positions to storage (but keep them ACTIVE in blockchain)
    await this.savePositions();
    
    if (activePositions.length > 0) {
      logger.info(`Shutdown: Keeping ${activePositions.length} positions ACTIVE in Meteora pools`, {
        positions: activePositions.map(p => ({
          id: p.id.slice(0, 8),
          timeframe: p.timeframe,
          side: p.side,
          priceRange: p.priceRange
        })),
        note: 'Positions remain as liquidity in DLMM pools and will be loaded on next startup'
      });
    }
    
    logger.info('Trading service shutdown complete - positions preserved');
  }
}
