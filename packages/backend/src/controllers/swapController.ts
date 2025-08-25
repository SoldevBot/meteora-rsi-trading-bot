import { Request, Response } from 'express';
import axios from 'axios';
import { logger } from '../utils/logger';
import { SwapQuoteRequest, TOKEN_MINTS } from 'shared';

export const swapController = {
  async getQuote(req: Request, res: Response) {
    try {
      const { inputMint, outputMint, amount, slippageBps = 50 }: SwapQuoteRequest = req.body;

      if (!inputMint || !outputMint || !amount) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: inputMint, outputMint, amount',
          timestamp: new Date().toISOString()
        });
      }

      // Use Jupiter API for swap quotes
      const jupiterUrl = 'https://quote-api.jup.ag/v6/quote';
      const response = await axios.get(jupiterUrl, {
        params: {
          inputMint,
          outputMint,
          amount,
          slippageBps
        }
      });

      res.json({
        success: true,
        data: response.data,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Failed to get swap quote:', error);
      res.status(500).json({
        success: false,
        error: error.response?.data?.error || 'Failed to get swap quote',
        timestamp: new Date().toISOString()
      });
    }
  },

  async executeSwap(req: Request, res: Response) {
    try {
      const { quoteResponse, userPublicKey } = req.body;

      if (!quoteResponse || !userPublicKey) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: quoteResponse, userPublicKey',
          timestamp: new Date().toISOString()
        });
      }

      // Use Jupiter API to get swap transaction
      const jupiterSwapUrl = 'https://quote-api.jup.ag/v6/swap';
      const response = await axios.post(jupiterSwapUrl, {
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true
      });

      const { swapTransaction } = response.data;

      res.json({
        success: true,
        data: {
          transaction: swapTransaction,
          message: 'Swap transaction prepared. Sign and send this transaction.'
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Failed to prepare swap transaction:', error);
      res.status(500).json({
        success: false,
        error: error.response?.data?.error || 'Failed to prepare swap transaction',
        timestamp: new Date().toISOString()
      });
    }
  },

  async getTokens(req: Request, res: Response) {
    try {
      // Return commonly used tokens for the UI
      const tokens = [
        {
          mint: TOKEN_MINTS.SOL,
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
        },
        {
          mint: TOKEN_MINTS.USDC,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
          logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'
        }
      ];

      res.json({
        success: true,
        data: tokens,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get tokens:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get tokens',
        timestamp: new Date().toISOString()
      });
    }
  }
};
