import React from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Typography,
  Button,
} from '@mui/material'
import { TrendingUp, TrendingDown } from '@mui/icons-material'
import { Position } from 'shared'

interface PositionsTableProps {
  positions: Position[]
  onClosePosition: (positionId: string) => void
  isClosing: boolean
}

const PositionsTable: React.FC<PositionsTableProps> = ({ 
  positions, 
  onClosePosition, 
  isClosing 
}) => {
  // Positions are already sorted and limited by the backend, no need for client-side processing
  const sortedPositions = positions

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'success'
      case 'CLOSED':
        return 'default'
      default:
        return 'default'
    }
  }

  const getSideColor = (side: string) => {
    return side === 'BUY' ? 'success' : 'error'
  }

  const getSideIcon = (side: string) => {
    return side === 'BUY' ? <TrendingUp /> : <TrendingDown />
  }

  return (
    <div>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        Showing {sortedPositions.length} of {positions.length} positions (sorted by date, newest first)
      </Typography>
      <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Position ID</TableCell>
            <TableCell>Timeframe</TableCell>
            <TableCell>Side</TableCell>
            <TableCell>Amount</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Created</TableCell>
            <TableCell>PnL</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedPositions.map((position) => (
            <TableRow key={position.id}>
              <TableCell>
                <Typography variant="body2" fontFamily="monospace">
                  {position.id.slice(0, 8)}...
                </Typography>
              </TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={position.timeframe.toUpperCase()}
                  variant="outlined"
                />
              </TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={position.side}
                  color={getSideColor(position.side) as any}
                  icon={getSideIcon(position.side)}
                />
              </TableCell>
              <TableCell>
                <Typography variant="body2">
                  {position.amount.toFixed(4)} {position.side === 'BUY' ? 'SOL' : 'USDC'}
                </Typography>
              </TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={position.status}
                  color={getStatusColor(position.status) as any}
                />
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {new Date(position.createdAt).toLocaleDateString()}
                  <br />
                  {new Date(position.createdAt).toLocaleTimeString()}
                </Typography>
              </TableCell>
              <TableCell>
                {position.pnl !== undefined ? (
                  <Typography
                    variant="body2"
                    color={position.pnl >= 0 ? 'success.main' : 'error.main'}
                    fontWeight="bold"
                  >
                    {position.pnl >= 0 ? '+' : ''}{position.pnl.toFixed(4)} USDC
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    -
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                {position.status === 'ACTIVE' && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={() => onClosePosition(position.id)}
                    disabled={isClosing}
                  >
                    Close
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
    </div>
  )
}

export default PositionsTable
