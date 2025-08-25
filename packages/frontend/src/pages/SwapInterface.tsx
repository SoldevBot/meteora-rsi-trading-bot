import React, { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Alert,
  Paper,
  Divider,
} from '@mui/material'
import { SwapHoriz } from '@mui/icons-material'

// Declare Jupiter global
declare global {
  interface Window {
    Jupiter: {
      init: (config: {
        displayMode: string
        integratedTargetId: string
        endpoint?: string
        formProps?: any
      }) => void
    }
  }
}

const SwapInterface: React.FC = () => {
  const [isJupiterLoaded, setIsJupiterLoaded] = useState(false)

  React.useEffect(() => {
    // Initialize Jupiter plugin when component mounts
    const initJupiter = () => {
      if (window.Jupiter) {
        try {
          window.Jupiter.init({
            displayMode: "integrated",
            integratedTargetId: "jupiter-terminal",
            endpoint: "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY",
            formProps: {
              fixedOutputMint: false,
              swapMode: "ExactIn",
              initialAmount: "",
              initialInputMint: "So11111111111111111111111111111111111111112", // SOL
              initialOutputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
            },
          })
          setIsJupiterLoaded(true)
        } catch (error) {
          console.error('Failed to initialize Jupiter:', error)
        }
      } else {
        // Retry after a short delay if Jupiter is not ready
        setTimeout(initJupiter, 500)
      }
    }

    initJupiter()
  }, [])

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        🔄 Token Swap
      </Typography>
      
      <Typography variant="body1" color="text.secondary" paragraph>
        Use Jupiter's DEX aggregator to swap between SOL and USDC directly from the trading bot interface.
      </Typography>

      <Grid container spacing={3}>
        {/* Instructions */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                💡 How to Use
              </Typography>
              
              <Typography variant="body2" paragraph>
                1. <strong>Connect your wallet</strong> using the Jupiter interface
              </Typography>
              
              <Typography variant="body2" paragraph>
                2. <strong>Select tokens</strong> - SOL and USDC are pre-configured
              </Typography>
              
              <Typography variant="body2" paragraph>
                3. <strong>Enter amount</strong> you want to swap
              </Typography>
              
              <Typography variant="body2" paragraph>
                4. <strong>Review the route</strong> and price impact
              </Typography>
              
              <Typography variant="body2" paragraph>
                5. <strong>Execute the swap</strong> by clicking swap and confirming in your wallet
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="caption">
                  Jupiter finds the best route across all Solana DEXs for optimal pricing.
                </Typography>
              </Alert>
            </CardContent>
          </Card>
        </Grid>

        {/* Jupiter Terminal */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <SwapHoriz sx={{ mr: 1, verticalAlign: 'middle' }} />
                Jupiter Swap Terminal
              </Typography>
              
              {!isJupiterLoaded && (
                <Box textAlign="center" py={4}>
                  <Typography color="text.secondary">
                    Loading Jupiter swap interface...
                  </Typography>
                </Box>
              )}

              {/* Jupiter Terminal Container */}
              <Box
                id="jupiter-terminal"
                sx={{
                  minHeight: '500px',
                  '& .jupiter-terminal': {
                    borderRadius: '8px',
                  }
                }}
              />
              
              {!window.Jupiter && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Jupiter plugin not loaded. Please refresh the page.
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Quick Actions */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                ⚡ Quick Actions
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper 
                    elevation={1} 
                    sx={{ 
                      p: 2, 
                      textAlign: 'center', 
                      cursor: 'pointer',
                      '&:hover': { elevation: 3 }
                    }}
                  >
                    <Typography variant="h6" color="primary">
                      SOL → USDC
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Convert SOL to USDC for trading positions
                    </Typography>
                  </Paper>
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <Paper 
                    elevation={1} 
                    sx={{ 
                      p: 2, 
                      textAlign: 'center', 
                      cursor: 'pointer',
                      '&:hover': { elevation: 3 }
                    }}
                  >
                    <Typography variant="h6" color="primary">
                      USDC → SOL
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Convert USDC back to SOL
                    </Typography>
                  </Paper>
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <Paper 
                    elevation={1} 
                    sx={{ 
                      p: 2, 
                      textAlign: 'center', 
                      cursor: 'pointer',
                      '&:hover': { elevation: 3 }
                    }}
                  >
                    <Typography variant="h6" color="primary">
                      25% Balance
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Swap 25% of your balance
                    </Typography>
                  </Paper>
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <Paper 
                    elevation={1} 
                    sx={{ 
                      p: 2, 
                      textAlign: 'center', 
                      cursor: 'pointer',
                      '&:hover': { elevation: 3 }
                    }}
                  >
                    <Typography variant="h6" color="primary">
                      50% Balance
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Swap 50% of your balance
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default SwapInterface
