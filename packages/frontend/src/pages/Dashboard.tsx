import React from 'react'
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Alert,
  CircularProgress
} from '@mui/material'
import { TrendingUp, TrendingDown, AccountBalance, PriceCheck } from '@mui/icons-material'
import { useWalletBalance, usePositions, useRSIData, useHealth, useCurrentPrice, useBalanceHistory } from '../hooks/useApi'
import RSIChart from '../components/RSIChart'
import WalletBalanceChart from '../components/WalletBalanceChart'
import { Position, RSIData } from 'shared'

const Dashboard: React.FC = () => {
  const { data: balance, isLoading: balanceLoading, error: balanceError } = useWalletBalance()
  const { data: positions, isLoading: positionsLoading } = usePositions(100) // Limit to 100 for dashboard
  const { data: rsiData, isLoading: rsiLoading } = useRSIData()
  const { data: currentPrice, isLoading: priceLoading } = useCurrentPrice()
  const { isError: healthError } = useHealth()
  
  // Use persistent balance history from backend with limit for chart performance
  const { data: balanceHistory } = useBalanceHistory(500) // Only fetch last 50 entries for chart

  const activePositions = (positions as Position[] || []).filter((p: Position) => p.status === 'ACTIVE')
  const totalPnL = (positions as Position[] || []).reduce((sum: number, p: Position) => sum + (p.pnl || 0), 0)

  if (balanceError) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Failed to load dashboard data. Please check your connection and ensure the backend is running.
      </Alert>
    )
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        📊 Trading Dashboard
      </Typography>

      {/* Status Bar */}
      <Box sx={{ mb: 3 }}>
        <Chip
          label={healthError ? 'Backend Offline' : 'Backend Online'}
          color={healthError ? 'error' : 'success'}
          size="small"
          sx={{ mr: 1 }}
        />
        <Chip
          label={`${activePositions.length} Active Positions`}
          color="primary"
          size="small"
          sx={{ mr: 1 }}
        />
        <Chip
          label={`PnL: ${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(4)} USDC`}
          color={totalPnL >= 0 ? 'success' : 'error'}
          size="small"
        />
      </Box>

      <Grid container spacing={3}>
        {/* Current Price */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <PriceCheck sx={{ mr: 1, verticalAlign: 'middle' }} />
                Current Price
              </Typography>
              
              {priceLoading ? (
                <Box display="flex" justifyContent="center">
                  <CircularProgress size={24} />
                </Box>
              ) : currentPrice ? (
                <Box>
                  <Typography variant="h4" color="primary">
                    ${currentPrice.price.toFixed(4)}
                  </Typography>
                  <Typography variant="h6" color="text.secondary">
                    {currentPrice.baseToken}/{currentPrice.quoteToken}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Last updated: {new Date(currentPrice.timestamp).toLocaleTimeString()}
                  </Typography>
                </Box>
              ) : (
                <Typography color="error">Failed to load price</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Wallet Balance */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <AccountBalance sx={{ mr: 1, verticalAlign: 'middle' }} />
                Wallet Balance
              </Typography>
              
              {balanceLoading ? (
                <Box display="flex" justifyContent="center">
                  <CircularProgress size={24} />
                </Box>
              ) : balance ? (
                <Box>
                  <Typography variant="h4" color="primary">
                    {balance.sol.toFixed(4)} {currentPrice?.baseToken || 'SOL'}
                  </Typography>
                  <Typography variant="h5" color="secondary">
                    {balance.usdc.toFixed(2)} {currentPrice?.quoteToken || 'USDC'}
                  </Typography>
                  
                  {/* Total Balance in USD */}
                  <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(25, 118, 210, 0.1)', borderRadius: 1 }}>
                    <Typography variant="h5" color="primary" fontWeight="bold">
                      Total: ${((balance.sol * (currentPrice?.price || 180)) + balance.usdc).toFixed(2)} USD
                    </Typography>
                  </Box>
                  
                  <Typography variant="caption" color="text.secondary">
                    Last updated: {new Date(balance.timestamp).toLocaleTimeString()}
                  </Typography>
                </Box>
              ) : (
                <Typography color="error">Failed to load balance</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Quick Stats */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                📈 Quick Stats
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Box textAlign="center">
                    <Typography variant="h3" color="primary">
                      {activePositions.length}
                    </Typography>
                    <Typography variant="caption">Active Positions</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box textAlign="center">
                    <Typography 
                      variant="h3" 
                      color={totalPnL >= 0 ? 'success.main' : 'error.main'}
                    >
                      {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}
                    </Typography>
                    <Typography variant="caption">Total PnL (USDC)</Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* RSI Overview */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                📊 RSI Overview
              </Typography>
              
              {rsiLoading ? (
                <Box display="flex" justifyContent="center" py={3}>
                  <CircularProgress />
                </Box>
              ) : rsiData && (rsiData as RSIData[]).length > 0 ? (
                <Grid container spacing={2}>
                  {(rsiData as RSIData[]).map((rsi) => (
                    <Grid item xs={6} md={2.4} key={rsi.timeframe}>
                      <Card variant="outlined">
                        <CardContent sx={{ textAlign: 'center', py: 2 }}>
                          <Typography variant="h6" color="primary">
                            {rsi.timeframe.toUpperCase()}
                          </Typography>
                          <Typography variant="h4" sx={{ my: 1 }}>
                            {rsi.value.toFixed(1)}
                          </Typography>
                          <Chip
                            size="small"
                            label={rsi.signal}
                            color={
                              rsi.signal === 'OVERSOLD' ? 'success' :
                              rsi.signal === 'OVERBOUGHT' ? 'error' : 'default'
                            }
                            icon={
                              rsi.signal === 'OVERSOLD' ? <TrendingUp /> :
                              rsi.signal === 'OVERBOUGHT' ? <TrendingDown /> : undefined
                            }
                          />
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Typography color="text.secondary">No RSI data available</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Wallet Balance Chart */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <WalletBalanceChart 
                balanceHistory={balanceHistory || []} 
                currentPrice={currentPrice?.price || 180} 
              />
            </CardContent>
          </Card>
        </Grid>

        {/* RSI Chart */}
        <Grid item xs={12} lg={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                📈 RSI Chart
              </Typography>
              <RSIChart data={(rsiData as RSIData[]) || []} />
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Positions */}
        <Grid item xs={12} lg={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                🎯 Recent Positions
              </Typography>
              
              {positionsLoading ? (
                <Box display="flex" justifyContent="center">
                  <CircularProgress size={24} />
                </Box>
              ) : activePositions.length > 0 ? (
                <Box>
                  {activePositions.slice(0, 5).map((position) => (
                    <Box
                      key={position.id}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        py: 1,
                        borderBottom: '1px solid',
                        borderColor: 'divider'
                      }}
                    >
                      <Box>
                        <Typography variant="body2" fontWeight="bold">
                          {position.timeframe.toUpperCase()} {position.side}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {position.amount.toFixed(4)} {position.side === 'BUY' ? 'SOL' : 'USDC'}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={position.status}
                        color="primary"
                      />
                    </Box>
                  ))}
                  
                  {activePositions.length > 5 && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      +{activePositions.length - 5} more positions
                    </Typography>
                  )}
                </Box>
              ) : (
                <Typography color="text.secondary">No active positions</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Dashboard
