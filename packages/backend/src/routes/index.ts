import { Express } from 'express';
import { apiRoutes } from './api';

export const setupRoutes = (app: Express): void => {
  // API routes
  app.use('/api', apiRoutes);

  // Catch-all route for undefined endpoints
  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      timestamp: new Date().toISOString()
    });
  });
};
