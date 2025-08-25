import React from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  IconButton,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import { Close, TrendingUp, TrendingDown } from '@mui/icons-material'
import { usePositions, useClosePosition } from '../hooks/useApi'
import { Position } from 'shared'

const Positions: React.FC = () => {
  const { data: positions, isLoading, error, refetch } = usePositions(100) // Limit to 100 for positions page
  const closePositionMutation = useClosePosition()
  const [confirmClose, setConfirmClose] = React.useState<string | null>(null)

  const handleClosePosition = async (positionId: string) => {
    try {
      await closePositionMutation.mutateAsync(positionId)
      setConfirmClose(null)
      refetch()
    } catch (error) {
      console.error('Failed to close position:', error)
    }
  }

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

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Failed to load positions. Please try again.
      </Alert>
    )
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        🎯 Trading Positions
      </Typography>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            All Positions
          </Typography>

          {!positions || positions.length === 0 ? (
            <Box textAlign="center" py={4}>
              <Typography color="text.secondary">
                No positions found. Start trading to see your positions here.
              </Typography>
            </Box>
          ) : (
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
                  {positions.map((position: Position) => (
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
                          {new Date(position.createdAt).toLocaleDateString()}<br />
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
                            onClick={() => setConfirmClose(position.id)}
                            disabled={closePositionMutation.isPending}
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
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog
        open={!!confirmClose}
        onClose={() => setConfirmClose(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Confirm Position Close
          <IconButton
            onClick={() => setConfirmClose(null)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to close this position? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClose(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => confirmClose && handleClosePosition(confirmClose)}
            color="error"
            variant="contained"
            disabled={closePositionMutation.isPending}
          >
            {closePositionMutation.isPending ? 'Closing...' : 'Close Position'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Positions
