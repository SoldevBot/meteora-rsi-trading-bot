import React, { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Divider,
} from '@mui/material'
import { useConfig, useUpdateConfig } from '../hooks/useApi'
import { TradingConfig, Timeframe } from 'shared'

const Configuration: React.FC = () => {
  const { data: config, isLoading } = useConfig()
  const updateConfigMutation = useUpdateConfig()
  const [localConfig, setLocalConfig] = useState<Partial<TradingConfig>>({})
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  React.useEffect(() => {
    if (config) {
      setLocalConfig(config)
    }
  }, [config])

  const handleSave = async () => {
    try {
      await updateConfigMutation.mutateAsync(localConfig)
      setMessage({ type: 'success', text: 'Configuration updated successfully!' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update configuration' })
      setTimeout(() => setMessage(null), 5000)
    }
  }

  const handleReset = () => {
    if (config) {
      setLocalConfig(config)
      setMessage(null)
    }
  }

  const timeframes: Timeframe[] = ['1m', '15m', '1h', '4h', '1d']

  if (isLoading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          ⚙️ Configuration
        </Typography>
        <Typography>Loading configuration...</Typography>
      </Box>
    )
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        ⚙️ Configuration
      </Typography>

      {message && (
        <Alert severity={message.type} sx={{ mb: 3 }}>
          {message.text}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* RSI Settings */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                📊 RSI Settings
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="RSI Period"
                    type="number"
                    value={localConfig.rsiPeriod || 14}
                    onChange={(e) => setLocalConfig({
                      ...localConfig,
                      rsiPeriod: parseInt(e.target.value)
                    })}
                    helperText="Number of periods for RSI calculation (2-100)"
                    inputProps={{ min: 2, max: 100 }}
                  />
                </Grid>
                
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Oversold Threshold"
                    type="number"
                    value={localConfig.oversoldThreshold || 30}
                    onChange={(e) => setLocalConfig({
                      ...localConfig,
                      oversoldThreshold: parseInt(e.target.value)
                    })}
                    helperText="Buy signal threshold"
                    inputProps={{ min: 1, max: 50 }}
                  />
                </Grid>
                
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Overbought Threshold"
                    type="number"
                    value={localConfig.overboughtThreshold || 70}
                    onChange={(e) => setLocalConfig({
                      ...localConfig,
                      overboughtThreshold: parseInt(e.target.value)
                    })}
                    helperText="Sell signal threshold"
                    inputProps={{ min: 50, max: 99 }}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Trading Settings */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                ⚡ Trading Settings
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Check Interval (ms)"
                    type="number"
                    value={localConfig.checkInterval || 60000}
                    onChange={(e) => setLocalConfig({
                      ...localConfig,
                      checkInterval: parseInt(e.target.value)
                    })}
                    helperText="How often to check for trading signals"
                    inputProps={{ min: 1000 }}
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Enabled Timeframes</InputLabel>
                    <Select
                      multiple
                      value={localConfig.enabledTimeframes || []}
                      onChange={(e) => setLocalConfig({
                        ...localConfig,
                        enabledTimeframes: e.target.value as Timeframe[]
                      })}
                      renderValue={(selected) => (selected as string[]).join(', ')}
                    >
                      {timeframes.map((tf) => (
                        <MenuItem key={tf} value={tf}>
                          {tf.toUpperCase()}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Position Factors */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                💰 Position Size Factors
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Percentage of wallet balance to use for each timeframe (0.01 = 1%)
              </Typography>
              
              <Grid container spacing={2}>
                {timeframes.map((timeframe) => (
                  <Grid item xs={6} md={2.4} key={timeframe}>
                    <TextField
                      fullWidth
                      label={`${timeframe.toUpperCase()} Factor`}
                      type="number"
                      value={localConfig.positionFactors?.[timeframe] || 0.01}
                      onChange={(e) => setLocalConfig({
                        ...localConfig,
                        positionFactors: {
                          ...localConfig.positionFactors,
                          [timeframe]: parseFloat(e.target.value)
                        } as Record<Timeframe, number>
                      })}
                      inputProps={{ 
                        min: 0, 
                        max: 1, 
                        step: 0.001 
                      }}
                      helperText={`${((localConfig.positionFactors?.[timeframe] || 0.01) * 100).toFixed(1)}%`}
                    />
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Safety Settings */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                🛡️ Safety Settings
              </Typography>
              
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  ⚠️ Security Warning
                </Typography>
                <Typography variant="body2">
                  Always use test wallets for development. Never share your seed phrase. 
                  Trading involves financial risk and this bot is for educational purposes.
                </Typography>
              </Alert>

              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Typography variant="body2">
                  Testnet Mode: {localConfig.useTestnet ? '✅ Enabled' : '❌ Disabled'}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      {/* Action Buttons */}
      <Box display="flex" gap={2} justifyContent="flex-end">
        <Button
          variant="outlined"
          onClick={handleReset}
          disabled={updateConfigMutation.isPending}
        >
          Reset
        </Button>
        
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={updateConfigMutation.isPending}
        >
          {updateConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}
        </Button>
      </Box>
    </Box>
  )
}

export default Configuration
