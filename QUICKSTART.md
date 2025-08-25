# 🌟 Meteora Trading Bot - Quick Start Guide

## 🚀 Getting Started

1. **Run the setup script:**
   ```bash
   ./start.sh
   ```

2. **Configure your environment:**
   - Edit `packages/backend/.env` with your API keys
   - Add your test wallet seed phrase (NEVER use your main wallet!)

3. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

## 🔧 Manual Setup

If you prefer manual setup:

```bash
# Install dependencies
yarn install-all

# Configure environment
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env

# Edit the .env files with your settings
nano packages/backend/.env

# Build the project
yarn build

# Start development servers
yarn dev
```

## 📋 Required Configuration

### Backend (.env)
- `HELIUS_API_KEY`: Your Helius RPC API key
- `WALLET_SEED_PHRASE`: Test wallet seed phrase (12 words)
- `BINANCE_API_KEY`: (Optional) For enhanced price data

### Important Settings
- RSI thresholds (default: 30/70)
- Position factors per timeframe
- Check intervals

## 🛡️ Security Checklist

- [ ] Using test wallet only
- [ ] Started with Devnet
- [ ] API keys are secured
- [ ] .env files not committed to git
- [ ] Understanding trading risks

## 🎯 Quick Test

1. Go to Configuration page
2. Set small position factors (0.001 = 0.1%)
3. Enable 1h timeframe only
4. Monitor RSI signals on Dashboard
5. Check Positions page for trades

## 📊 Trading Strategy

The bot uses RSI-based signals:
- **RSI < 30**: Creates BUY position (USDC → SOL)
- **RSI > 70**: Creates SELL position (SOL → USDC)
- **Signal reversal**: Closes existing positions

## 🔗 Useful Links

- [Meteora DLMM Docs](https://docs.meteora.ag/)
- [Jupiter Swap](https://jup.ag/)
- [Solana Docs](https://docs.solana.com/)

## 🆘 Troubleshooting

**Bot not connecting?**
- Check Helius API key
- Verify network (mainnet/devnet)
- Check wallet seed phrase format

**No trading signals?**
- RSI needs time to calculate (14+ periods)
- Check if timeframes are enabled
- Verify position factors > 0

**Positions not creating?**
- Check wallet balance
- Verify minimum amounts
- Check console logs for errors
