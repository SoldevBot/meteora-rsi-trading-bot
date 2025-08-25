import { Router } from 'express';
import { walletController } from '../controllers/walletController';
import { positionsController } from '../controllers/positionsController';
import { rsiController } from '../controllers/rsiController';
import { configController } from '../controllers/configController';
import { swapController } from '../controllers/swapController';
import { authController } from '../controllers/authController';

const router = Router();

// Auth routes
router.post('/auth/verify', authController.verifyPassword);

// Wallet routes
router.get('/wallet/balance', walletController.getBalance);
router.get('/wallet/balance-history', walletController.getBalanceHistory);

// Positions routes
router.get('/positions', positionsController.getPositions);
router.post('/positions', positionsController.createPosition);
router.delete('/positions/:id', positionsController.closePosition);
router.post('/positions/sync', positionsController.syncPositions);

// RSI and Price data routes
router.get('/rsi/:timeframe', rsiController.getRSI);
router.get('/rsi', rsiController.getAllRSI);
router.get('/price/current', rsiController.getCurrentPrice);
router.get('/cache/status', rsiController.getCacheStatus);

// Configuration routes
router.get('/config', configController.getConfig);
router.put('/config', configController.updateConfig);

// Swap routes (Jupiter integration)
router.get('/tokens', swapController.getTokens);
router.post('/swap/quote', swapController.getQuote);
router.post('/swap/execute', swapController.executeSwap);

export { router as apiRoutes };
