import axios from 'axios'
import { Position, WalletBalance, RSIData, TradingConfig, APIResponse, Timeframe } from 'shared'

const API_BASE_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:3001'

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 10000,
})

// Request interceptor
api.interceptors.request.use((config) => {
  return config
})

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

export const apiService = {
  // Wallet endpoints
  async getWalletBalance(): Promise<WalletBalance> {
    const response = await api.get<APIResponse<WalletBalance>>('/wallet/balance')
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get wallet balance')
    }
    return response.data.data
  },

  async getBalanceHistory(limit?: number): Promise<(WalletBalance & { timestamp: number })[]> {
    const params = limit ? { limit: limit.toString() } : {}
    const response = await api.get<APIResponse<(WalletBalance & { timestamp: number })[]>>('/wallet/balance-history', { params })
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get balance history')
    }
    return response.data.data
  },

  // Positions endpoints
  async getPositions(limit?: number, order: 'asc' | 'desc' = 'desc'): Promise<Position[]> {
    const params: any = {}
    if (limit) params.limit = limit.toString()
    if (order) params.order = order
    
    const response = await api.get<APIResponse<Position[]>>('/positions', { params })
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get positions')
    }
    return response.data.data
  },

  async createPosition(timeframe: Timeframe, side: 'BUY' | 'SELL', amount: number): Promise<Position> {
    const response = await api.post<APIResponse<Position>>('/positions', {
      timeframe,
      side,
      amount
    })
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to create position')
    }
    return response.data.data
  },

  async closePosition(positionId: string): Promise<{ 
    baseTokenReceived: number; 
    quoteTokenReceived: number; 
    baseTokenSymbol: string; 
    quoteTokenSymbol: string 
  } | null> {
    const response = await api.delete(`/positions/${positionId}`)
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to close position')
    }
    return response.data.data
  },

  // RSI endpoints
  async getRSI(timeframe: Timeframe): Promise<RSIData> {
    const response = await api.get<APIResponse<RSIData>>(`/rsi/${timeframe}`)
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get RSI data')
    }
    return response.data.data
  },

  async getAllRSI(): Promise<RSIData[]> {
    const response = await api.get<APIResponse<RSIData[]>>('/rsi')
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get RSI data')
    }
    return response.data.data
  },

  // Configuration endpoints
  async getConfig(): Promise<TradingConfig> {
    const response = await api.get<APIResponse<TradingConfig>>('/config')
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get configuration')
    }
    return response.data.data
  },

  async updateConfig(config: Partial<TradingConfig>): Promise<TradingConfig> {
    const response = await api.put<APIResponse<TradingConfig>>('/config', config)
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to update configuration')
    }
    return response.data.data
  },

  async syncPositions(): Promise<void> {
    const response = await api.post<APIResponse<void>>('/positions/sync')
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to sync positions')
    }
  },

  // Price endpoints
  async getCurrentPrice(): Promise<{ price: number; symbol: string; baseToken: string; quoteToken: string; timestamp: string }> {
    const response = await api.get('/price/current')
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get current price')
    }
    return response.data.data
  },

  // Jupiter Swap endpoints
  async getSwapQuote(inputMint: string, outputMint: string, amount: number, slippageBps: number = 50) {
    const response = await api.post('/swap/quote', {
      inputMint,
      outputMint,
      amount,
      slippageBps
    })
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get swap quote')
    }
    return response.data.data
  },

  async executeSwap(quoteResponse: any, userPublicKey: string) {
    const response = await api.post('/swap/execute', {
      quoteResponse,
      userPublicKey
    })
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to execute swap')
    }
    return response.data.data
  },

  async getTokens() {
    const response = await api.get('/tokens')
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get tokens')
    }
    return response.data.data
  },

  // Health check
  async checkHealth(): Promise<{ status: string; timestamp: string }> {
    const response = await axios.get(`${API_BASE_URL}/health`)
    return response.data
  },

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await axios.get(`${API_BASE_URL}/health`)
    return response.data
  }
}
