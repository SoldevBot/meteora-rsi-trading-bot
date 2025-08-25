interface AuthResponse {
  success: boolean;
  message: string;
  remainingAttempts?: number;
  remainingTime?: number;
}

class AuthService {
  private baseUrl = '/api';

  async verifyPassword(password: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data: AuthResponse = await response.json();
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(`Rate limit exceeded. ${data.message}`);
        }
        throw new Error(data.message || 'Authentication failed');
      }

      return data.success;
    } catch (error) {
      console.error('Auth verification error:', error);
      throw error;
    }
  }
}

export const authService = new AuthService();
