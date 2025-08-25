import React from 'react'
import { Box, Container, AppBar, Toolbar, Typography, Button, Paper, IconButton } from '@mui/material'
import { TrendingUp, Settings, AccountBalance, Logout } from '@mui/icons-material'
import Dashboard from './pages/Dashboard'
import Trading from './pages/Trading'
import Positions from './pages/Positions'
import Configuration from './pages/Configuration'
import SwapInterface from './pages/SwapInterface'
import { LoginForm } from './components/LoginForm'
import { authService } from './services/auth'

function App() {
  const [currentTab, setCurrentTab] = React.useState('dashboard')
  const [isAuthenticated, setIsAuthenticated] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(true)

  // Check if user is already authenticated (e.g., from localStorage)
  React.useEffect(() => {
    const storedAuth = localStorage.getItem('meteorabot_authenticated')
    if (storedAuth === 'true') {
      setIsAuthenticated(true)
    }
    setIsLoading(false)
  }, [])

  const handleLogin = async (password: string): Promise<boolean> => {
    try {
      const success = await authService.verifyPassword(password)
      if (success) {
        setIsAuthenticated(true)
        localStorage.setItem('meteorabot_authenticated', 'true')
        return true
      }
      return false
    } catch (error) {
      console.error('Login error:', error)
      return false
    }
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    localStorage.removeItem('meteorabot_authenticated')
    setCurrentTab('dashboard')
  }

  if (isLoading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh',
        bgcolor: 'background.default'
      }}>
        <Typography>Loading...</Typography>
      </Box>
    )
  }

  if (!isAuthenticated) {
    return <LoginForm onLogin={handleLogin} />
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <TrendingUp />, component: Dashboard },
    { id: 'trading', label: 'Trading', icon: <AccountBalance />, component: Trading },
    { id: 'positions', label: 'Positions', icon: <AccountBalance />, component: Positions },
    { id: 'swap', label: 'Swap', icon: <TrendingUp />, component: SwapInterface },
    { id: 'config', label: 'Configuration', icon: <Settings />, component: Configuration },
  ]

  const CurrentComponent = navItems.find(item => item.id === currentTab)?.component || Dashboard

  return (
    <Box sx={{ flexGrow: 1, minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" sx={{ bgcolor: 'background.paper', boxShadow: 1 }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, color: 'primary.main' }}>
            🌟 Meteora Trading Bot
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {navItems.map((item) => (
              <Button
                key={item.id}
                startIcon={item.icon}
                onClick={() => setCurrentTab(item.id)}
                variant={currentTab === item.id ? 'contained' : 'text'}
                color={currentTab === item.id ? 'primary' : 'inherit'}
                sx={{ 
                  textTransform: 'none',
                  color: currentTab === item.id ? 'white' : 'text.primary'
                }}
              >
                {item.label}
              </Button>
            ))}
            
            <IconButton
              onClick={handleLogout}
              color="inherit"
              sx={{ ml: 2 }}
              title="Logout"
            >
              <Logout />
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 3, mb: 3 }}>
        <Paper elevation={2} sx={{ p: 3, minHeight: 'calc(100vh - 140px)' }}>
          <CurrentComponent />
        </Paper>
      </Container>
    </Box>
  )
}

export default App
