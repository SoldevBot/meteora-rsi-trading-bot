import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiService } from '../services/api'
import { Position, RSIData, TradingConfig, Timeframe } from 'shared'

// Query keys
const QUERY_KEYS = {
  WALLET_BALANCE: 'walletBalance',
  BALANCE_HISTORY: 'balanceHistory',
  POSITIONS: 'positions',
  RSI_DATA: 'rsiData',
  CONFIG: 'config',
  HEALTH: 'health',
  CURRENT_PRICE: 'currentPrice'
} as const

// Wallet hooks
export const useWalletBalance = () => {
  return useQuery({
    queryKey: [QUERY_KEYS.WALLET_BALANCE],
    queryFn: apiService.getWalletBalance,
    refetchInterval: 30000, // Refetch every 30 seconds
  })
}

export const useBalanceHistory = (limit?: number) => {
  return useQuery({
    queryKey: [QUERY_KEYS.BALANCE_HISTORY, limit],
    queryFn: () => apiService.getBalanceHistory(limit),
    refetchInterval: 60000, // Refetch every minute
  })
}

// Price hooks
export const useCurrentPrice = () => {
  return useQuery({
    queryKey: [QUERY_KEYS.CURRENT_PRICE],
    queryFn: apiService.getCurrentPrice,
    refetchInterval: 15000, // Refetch every 15 seconds
  })
}

// Position hooks
export const usePositions = (limit?: number, order: 'asc' | 'desc' = 'desc') => {
  return useQuery<Position[]>({
    queryKey: [QUERY_KEYS.POSITIONS, limit, order],
    queryFn: () => apiService.getPositions(limit, order),
    refetchInterval: 30000, // Refetch every 30 seconds
  })
}

export const useCreatePosition = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (params: { timeframe: Timeframe; side: 'BUY' | 'SELL'; amount: number }) => 
      apiService.createPosition(params.timeframe, params.side, params.amount),
    onSuccess: () => {
      // Invalidate positions and wallet balance on successful position creation
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.POSITIONS] })
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WALLET_BALANCE] })
    }
  })
}

export const useClosePosition = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: apiService.closePosition,
    onSuccess: () => {
      // Invalidate positions and wallet balance on successful position closure
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.POSITIONS] })
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WALLET_BALANCE] })
    }
  })
}

export const useSyncPositions = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: apiService.syncPositions,
    onSuccess: () => {
      // Invalidate positions on successful sync
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.POSITIONS] })
    }
  })
}

// RSI hooks
export const useRSIData = (timeframe?: Timeframe) => {
  const queryKey = timeframe ? [QUERY_KEYS.RSI_DATA, timeframe] : [QUERY_KEYS.RSI_DATA]
  return useQuery<RSIData[]>(
    queryKey,
    () => timeframe ? apiService.getRSI(timeframe).then(data => [data]) : apiService.getAllRSI(),
    {
      refetchInterval: 60000, // Refetch every minute
    }
  )
}

// Config hooks
export const useConfig = () => {
  return useQuery<TradingConfig>({
    queryKey: [QUERY_KEYS.CONFIG],
    queryFn: apiService.getConfig,
    // Config doesn't change often, so longer refetch interval
    refetchInterval: 300000, // 5 minutes
  })
}

export const useUpdateConfig = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: apiService.updateConfig,
    onSuccess: () => {
      // Invalidate config on successful update
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONFIG] })
    }
  })
}

// Health hooks
export const useHealth = () => {
  return useQuery({
    queryKey: [QUERY_KEYS.HEALTH],
    queryFn: apiService.checkHealth,
    refetchInterval: 60000, // Refetch every minute
    retry: 1, // Only retry once for health checks
  })
}

// Export query keys for external use
export { QUERY_KEYS }