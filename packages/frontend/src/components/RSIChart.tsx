import React from 'react'
import { Box, Typography } from '@mui/material'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import 'chartjs-adapter-date-fns'
import { RSIData } from 'shared'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
)

interface RSIChartProps {
  data: RSIData[]
}

const RSIChart: React.FC<RSIChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography color="text.secondary">
          No RSI data available for chart
        </Typography>
      </Box>
    )
  }

  // Sort data by timeframe for consistent display
  const sortedData = [...data].sort((a, b) => {
    const timeframeOrder = { '1m': 1, '15m': 2, '1h': 3, '4h': 4, '1d': 5 }
    return (timeframeOrder[a.timeframe as keyof typeof timeframeOrder] || 0) - 
           (timeframeOrder[b.timeframe as keyof typeof timeframeOrder] || 0)
  })

  const chartData = {
    labels: sortedData.map(item => item.timeframe.toUpperCase()),
    datasets: [
      {
        label: 'RSI',
        data: sortedData.map(item => item.value),
        borderColor: 'rgb(0, 212, 170)',
        backgroundColor: 'rgba(0, 212, 170, 0.1)',
        borderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
        tension: 0.4,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgb(0, 212, 170)',
        borderWidth: 1,
        callbacks: {
          label: function(context: any) {
            const rsiValue = context.parsed.y
            const signal = sortedData[context.dataIndex].signal
            return [
              `RSI: ${rsiValue.toFixed(1)}`,
              `Signal: ${signal}`,
            ]
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: '#fff',
        },
      },
      y: {
        min: 0,
        max: 100,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: '#fff',
        },
      },
    },
    elements: {
      point: {
        backgroundColor: function(context: any) {
          const value = context.parsed.y
          if (value < 30) return '#4caf50' // Green for oversold
          if (value > 70) return '#f44336' // Red for overbought
          return '#00d4aa' // Default primary color
        },
        borderColor: function(context: any) {
          const value = context.parsed.y
          if (value < 30) return '#4caf50'
          if (value > 70) return '#f44336'
          return '#00d4aa'
        },
      },
    },
  }

  return (
    <Box sx={{ height: '300px', position: 'relative' }}>
      {/* Reference lines */}
      <Box
        sx={{
          position: 'absolute',
          top: '20%',
          left: 0,
          right: 0,
          borderTop: '1px dashed #f44336',
          opacity: 0.5,
          zIndex: 1,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          borderTop: '1px dashed #fff',
          opacity: 0.3,
          zIndex: 1,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          top: '80%',
          left: 0,
          right: 0,
          borderTop: '1px dashed #4caf50',
          opacity: 0.5,
          zIndex: 1,
        }}
      />
      
      {/* Labels for reference lines */}
      <Typography
        variant="caption"
        sx={{
          position: 'absolute',
          top: '15%',
          right: '10px',
          color: '#f44336',
          fontSize: '12px',
          zIndex: 2,
        }}
      >
        Overbought (70)
      </Typography>
      <Typography
        variant="caption"
        sx={{
          position: 'absolute',
          top: '45%',
          right: '10px',
          color: '#fff',
          fontSize: '12px',
          opacity: 0.7,
          zIndex: 2,
        }}
      >
        Neutral (50)
      </Typography>
      <Typography
        variant="caption"
        sx={{
          position: 'absolute',
          top: '75%',
          right: '10px',
          color: '#4caf50',
          fontSize: '12px',
          zIndex: 2,
        }}
      >
        Oversold (30)
      </Typography>

      <Line data={chartData} options={options} />
    </Box>
  )
}

export default RSIChart
