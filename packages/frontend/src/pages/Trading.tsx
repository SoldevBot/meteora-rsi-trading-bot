import React from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Alert,
  Chip,
} from '@mui/material'
import { TrendingUp, TrendingDown } from '@mui/icons-material'
import { useCreatePosition, useWalletBalance } from '../hooks/useApi'
import { Timeframe } from 'shared'

const Trading: React.FC = () => {
  const [timeframe, setTimeframe] = React.useState<Timeframe>('1h')
  const [side, setSide] = React.useState<'BUY' | 'SELL'>('BUY')
  const [amount, setAmount] = React.useState<string>('')
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const createPositionMutation = useCreatePosition()
  const { data: balance } = useWalletBalance()

  const timeframes: { value: Timeframe; label: string }[] = [
    { value: '1m', label: '1 Minute' },
    { value: '15m', label: '15 Minutes' },
    { value: '1h', label: '1 Hour' },
    { value: '4h', label: '4 Hours' },
    { value: '1d', label: '1 Day' },
  ]

  const handleCreatePosition = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setMessage({ type: 'error', text: 'Please enter a valid amount' })
      return
    }

    try {
      await createPositionMutation.mutateAsync({
        timeframe,
        side,
        amount: parseFloat(amount)
      })
      
      setMessage({ type: 'success', text: 'Position created successfully!' })
      setAmount('')
      setTimeout(() => setMessage(null), 3000)
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to create position' })
      setTimeout(() => setMessage(null), 5000)
    }
  }

  const getMaxAmount = () => {
    if (!balance) return 0
    
    if (side === 'BUY') {
      // For BUY positions (SOL-only): we need SOL tokens
      return balance.sol
    } else {
      // For SELL positions (USDC-only): we need USDC tokens
      return balance.usdc
    }
  }

  const getAmountLabel = () => {
    return side === 'BUY' ? 'Amount (SOL)' : 'Amount (USDC)'
  }

  const getAmountHelperText = () => {
    const max = getMaxAmount()
    const currency = side === 'BUY' ? 'SOL' : 'USDC'
    return `Available: ${max.toFixed(4)} ${currency} - ${side === 'BUY' ? 'SOL-only position above price' : 'USDC-only position below price'}`
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        📊 Manual Trading
      </Typography>
      
      <Typography variant="body1" color="text.secondary" paragraph>
        Create manual trading positions using Meteora DLMM pools. The bot will automatically 
        manage these positions based on RSI signals.
      </Typography>

      {message && (
        <Alert severity={message.type} sx={{ mb: 3 }}>
          {message.text}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Trading Form */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                🎯 Create Position
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Timeframe</InputLabel>
                    <Select
                      value={timeframe}
                      label="Timeframe"
                      onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                    >
                      {timeframes.map((tf) => (
                        <MenuItem key={tf.value} value={tf.value}>
                          {tf.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Side</InputLabel>
                    <Select
                      value={side}
                      label="Side"
                      onChange={(e) => setSide(e.target.value as 'BUY' | 'SELL')}
                    >
                      <MenuItem value="BUY">
                        <Box display="flex" alignItems="center" gap={1}>
                          <TrendingUp color="success" />
                          BUY (Expect Price Up)
                        </Box>
                      </MenuItem>
                      <MenuItem value="SELL">
                        <Box display="flex" alignItems="center" gap={1}>
                          <TrendingDown color="error" />
                          SELL (Expect Price Down)
                        </Box>
                      </MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label={getAmountLabel()}
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    helperText={getAmountHelperText()}
                    inputProps={{
                      min: 0,
                      max: getMaxAmount(),
                      step: side === 'BUY' ? '0.01' : '1'
                    }}
                  />
                  
                  <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setAmount((getMaxAmount() * 0.25).toFixed(4))}
                    >
                      25%
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setAmount((getMaxAmount() * 0.5).toFixed(4))}
                    >
                      50%
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setAmount((getMaxAmount() * 0.75).toFixed(4))}
                    >
                      75%
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setAmount(getMaxAmount().toFixed(4))}
                    >
                      Max
                    </Button>
                  </Box>
                </Grid>
                
                <Grid item xs={12}>
                  <Button
                    fullWidth
                    variant="contained"
                    size="large"
                    onClick={handleCreatePosition}
                    disabled={createPositionMutation.isPending || !amount}
                    color={side === 'BUY' ? 'success' : 'error'}
                    startIcon={side === 'BUY' ? <TrendingUp /> : <TrendingDown />}
                  >
                    {createPositionMutation.isPending ? 'Creating...' : `Create ${side} Position`}
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Position Info */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                ℹ️ Position Details
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Timeframe:
                  </Typography>
                  <Chip 
                    label={timeframe.toUpperCase()} 
                    variant="outlined" 
                    size="small" 
                  />
                </Grid>
                
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Side:
                  </Typography>
                  <Chip 
                    label={side} 
                    color={side === 'BUY' ? 'success' : 'error'}
                    size="small"
                    icon={side === 'BUY' ? <TrendingUp /> : <TrendingDown />}
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    <strong>Strategy:</strong> {side === 'BUY' ? 
                      'One-sided liquidity with USDC, expecting SOL price to increase' : 
                      'One-sided liquidity with SOL, expecting SOL price to decrease'
                    }
                  </Typography>
                </Grid>
                
                <Grid item xs={12}>
                  <Alert severity="info">
                    <Typography variant="body2">
                      <strong>How it works:</strong><br />
                      • Your position will be created as one-sided liquidity in Meteora DLMM<br />
                      • The bot monitors RSI signals for automatic management<br />
                      • Positions close when RSI signals reverse or reach targets
                    </Typography>
                  </Alert>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Balance Info */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                💰 Wallet Balance
              </Typography>
              
              <Grid container spacing={3}>
                <Grid item xs={6} md={3}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="primary">
                      {balance?.sol.toFixed(4) || '0.0000'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      SOL
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} md={3}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="secondary">
                      {balance?.usdc.toFixed(2) || '0.00'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      USDC
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Trading
