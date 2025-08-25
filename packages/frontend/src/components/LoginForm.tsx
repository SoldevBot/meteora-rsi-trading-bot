import React, { useState } from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  TextField, 
  Button, 
  Typography, 
  Alert,
  InputAdornment,
  IconButton
} from '@mui/material';
import { Visibility, VisibilityOff, Lock } from '@mui/icons-material';

interface LoginFormProps {
  onLogin: (password: string) => Promise<boolean>;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [blocked, setBlocked] = useState(false);

  const maxAttempts = 5;
  const blockDuration = 5 * 60 * 1000; // 5 minutes

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (blocked) {
      setError('Too many failed attempts. Please wait 5 minutes.');
      return;
    }

    if (!password.trim()) {
      setError('Please enter a password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const success = await onLogin(password);
      
      if (success) {
        setAttempts(0);
        setError('');
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        
        if (newAttempts >= maxAttempts) {
          setBlocked(true);
          setError(`Too many failed attempts. Access blocked for 5 minutes.`);
          
          // Unblock after 5 minutes
          setTimeout(() => {
            setBlocked(false);
            setAttempts(0);
            setError('');
          }, blockDuration);
        } else {
          setError(`Invalid password. ${maxAttempts - newAttempts} attempts remaining.`);
        }
        
        setPassword('');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Card sx={{ maxWidth: 400, width: '90%', boxShadow: 8 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Lock sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            <Typography variant="h4" component="h1" gutterBottom>
              🌟 Meteora Trading Bot
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Enter password to access the dashboard
            </Typography>
          </Box>

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              type={showPassword ? 'text' : 'password'}
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading || blocked}
              margin="normal"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading || blocked}
              sx={{ mt: 3, py: 1.5 }}
            >
              {loading ? 'Verifying...' : blocked ? 'Blocked' : 'Login'}
            </Button>
          </form>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>
            Rate limited: {maxAttempts} attempts per 5 minutes
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};
