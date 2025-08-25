import React, { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { Box, Typography } from '@mui/material'
import { WalletBalance } from 'shared'

interface WalletBalanceChartProps {
  balanceHistory: (WalletBalance & { timestamp: number })[]
  currentPrice?: number // Current SOL price for USD conversion
}

const WalletBalanceChart: React.FC<WalletBalanceChartProps> = ({ 
  balanceHistory, 
  currentPrice = 180 // Default fallback price if not provided
}) => {
  const chartData = useMemo(() => {
    if (!balanceHistory?.length) return []
    
    return balanceHistory
      .map(balance => {
        const solValueUSD = balance.sol * currentPrice
        const totalValueUSD = solValueUSD + balance.usdc
        
        return {
          time: new Date(balance.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
          }),
          timestamp: balance.timestamp,
          'SOL (USD)': parseFloat(solValueUSD.toFixed(2)),
          USDC: parseFloat(balance.usdc.toFixed(2)),
          Total: parseFloat(totalValueUSD.toFixed(2)),
          // Add raw SOL balance for tooltip
          solAmount: parseFloat(balance.sol.toFixed(4))
        }
      })
  }, [balanceHistory, currentPrice])

  if (!chartData.length) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height={300}>
        <Typography color="text.secondary">No balance history available</Typography>
      </Box>
    )
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload // Get the original data point
      
      return (
        <Box
          sx={{
            backgroundColor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            p: 1.5,
            boxShadow: 2
          }}
        >
          <Typography variant="subtitle2" gutterBottom>
            {label}
          </Typography>
          {payload.map((entry: any, index: number) => (
            <Typography
              key={index}
              variant="body2"
              sx={{ color: entry.color }}
            >
              {entry.name === 'SOL (USD)' ? (
                <>
                  {entry.name}: ${entry.value} USD
                  <br />
                  <span style={{ fontSize: '0.85em', opacity: 0.8 }}>
                    ({data?.solAmount} SOL)
                  </span>
                </>
              ) : (
                `${entry.name}: ${entry.name === 'USDC' ? `$${entry.value}` : `$${entry.value} USD`}`
              )}
            </Typography>
          ))}
        </Box>
      )
    }
    return null
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
        📊 Wallet Balance History
      </Typography>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart 
          data={chartData} 
          margin={{ top: 5, right: 50, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          <XAxis 
            dataKey="time" 
            tick={{ fontSize: 12 }}
            stroke="#9CA3AF"
            padding={{ left: 10, right: 10 }}
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            stroke="#9CA3AF"
          />
          <Tooltip 
            content={<CustomTooltip />}
            wrapperStyle={{ outline: 'none' }}
            allowEscapeViewBox={{ x: false, y: true }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="SOL (USD)"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            name="SOL (USD)"
          />
          <Line
            type="monotone"
            dataKey="USDC"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            name="USDC"
          />
          <Line
            type="monotone"
            dataKey="Total"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            name="Total (USD)"
            strokeDasharray="5 5"
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  )
}

export default WalletBalanceChart
