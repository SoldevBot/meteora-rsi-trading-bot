# 🌟 Meteora Trading Bot - Architecture & Development

## 🏗️ Project Structure

```
meteora-trading-bot/
├── packages/
│   ├── shared/                 # Common types & utilities
│   │   ├── src/types.ts       # Shared TypeScript interfaces
│   │   └── package.json
│   ├── backend/               # Node.js API & Trading Logic
│   │   ├── src/
│   │   │   ├── controllers/   # HTTP request handlers
│   │   │   ├── services/      # Business logic
│   │   │   ├── middleware/    # Express middleware
│   │   │   ├── routes/        # API route definitions
│   │   │   ├── utils/         # Utility functions
│   │   │   └── app.ts         # Express application
│   │   ├── tests/             # Unit tests
│   │   └── package.json
│   └── frontend/              # React Dashboard
│       ├── src/
│       │   ├── components/    # Reusable UI components
│       │   ├── pages/         # Page components
│       │   ├── hooks/         # Custom React hooks
│       │   ├── services/      # API client
│       │   └── App.tsx        # Main React app
│       └── package.json
├── package.json               # Root workspace config
└── README.md
```

## 🔧 Technology Stack

### Backend
- **Node.js + TypeScript**: Runtime and language
- **Express.js**: Web framework
- **@solana/web3.js**: Solana blockchain interaction
- **@meteora-ag/dlmm-sdk**: Meteora DLMM integration
- **technicalindicators**: RSI calculations
- **axios**: HTTP client for external APIs
- **node-cron**: Scheduled task execution
- **winston**: Logging framework

### Frontend
- **React + TypeScript**: UI framework
- **Material-UI**: Component library
- **React Query**: State management & caching
- **Chart.js**: Data visualization
- **Vite**: Build tool and dev server

### Infrastructure
- **Yarn Workspaces**: Monorepo management
- **Jupiter Plugin**: DEX aggregation
- **Helius RPC**: Solana network access
- **Binance API**: Price data source

## 🔄 Data Flow

```
1. Binance API → Kline Data → RSI Calculation
2. RSI Signals → Trading Logic → Meteora DLMM
3. Position Updates → Database → Frontend
4. User Actions → API → Blockchain Transactions
```

## 🧠 Trading Logic

### RSI Strategy
1. **Data Collection**: Fetch OHLC data from Binance
2. **RSI Calculation**: Use 14-period RSI by default
3. **Signal Generation**:
   - RSI < 30: Oversold → BUY signal
   - RSI > 70: Overbought → SELL signal
4. **Position Management**: Create one-sided liquidity positions
5. **Risk Management**: Close on signal reversal

### Position Sizing
- Configurable factors per timeframe (0.5% - 1.5% of balance)
- Dynamic calculation based on available balance
- Separate factors for SOL and USDC sides

### Meteora Integration
- **One-sided Liquidity**: Provide only one token to the pool
- **BUY Positions**: Provide USDC, earn from price increases
- **SELL Positions**: Provide SOL, earn from price decreases
- **Auto-management**: Bot monitors and closes positions

## 🔌 API Endpoints

### Wallet Management
- `GET /api/wallet/balance` - Get current wallet balance
- `GET /api/health` - Service health check

### Position Management
- `GET /api/positions` - List all positions
- `POST /api/positions` - Create new position
- `DELETE /api/positions/:id` - Close position

### Market Data
- `GET /api/rsi/:timeframe` - Get RSI for specific timeframe
- `GET /api/rsi` - Get RSI for all enabled timeframes

### Configuration
- `GET /api/config` - Get current trading configuration
- `PUT /api/config` - Update trading configuration

### Jupiter Integration
- `GET /api/tokens` - Get supported tokens
- `POST /api/swap/quote` - Get swap quote
- `POST /api/swap/execute` - Execute swap

## 🗂️ Key Components

### Backend Services

#### TradingService
- Wallet management and initialization
- Position creation and management
- Integration with Meteora DLMM SDK
- Balance tracking and updates

#### DataService
- Binance API integration
- RSI calculation using technicalindicators library
- Price data aggregation
- Multi-timeframe support

#### SchedulerService
- Cron-based signal monitoring
- Automated position management
- Configurable check intervals
- Error handling and recovery

### Frontend Components

#### Dashboard
- Real-time RSI visualization
- Wallet balance display
- Position overview
- Health monitoring

#### Trading Interface
- Manual position creation
- Risk management controls
- Balance-based sizing
- Strategy explanation

#### Configuration Panel
- RSI parameter tuning
- Timeframe selection
- Position factor adjustment
- Safety warnings

#### Jupiter Swap
- Integrated DEX aggregation
- SOL/USDC swapping
- Route optimization
- Transaction execution

## 🔐 Security Measures

### Wallet Security
- BIP39 seed phrase validation
- Separate test/production environments
- Encrypted storage recommendations
- Hardware wallet support planning

### API Security
- Rate limiting (100 requests/15min)
- CORS configuration
- Helmet.js security headers
- Input validation and sanitization

### Environment Isolation
- Separate .env files per package
- Git ignore for sensitive files
- Development/production configurations
- Network isolation (devnet/mainnet)

## 📊 Monitoring & Logging

### Logging Strategy
- Winston-based structured logging
- Separate log files (error, combined)
- Configurable log levels
- Production-safe error handling

### Health Monitoring
- Service availability checks
- Database connection monitoring
- External API status tracking
- Real-time dashboard updates

### Error Handling
- Graceful degradation
- Automatic retry mechanisms
- User-friendly error messages
- Detailed logging for debugging

## 🚀 Deployment

### Development
```bash
yarn dev  # Start both backend and frontend
```

### Production
```bash
yarn build && yarn start
```

### Docker Support (Future)
- Multi-stage builds
- Environment-specific configs
- Health checks
- Scaling capabilities

## 🔮 Future Enhancements

### Trading Features
- Multiple token pair support
- Advanced trading strategies
- Portfolio rebalancing
- Stop-loss mechanisms

### Technical Improvements
- Database persistence
- WebSocket real-time updates
- Advanced charting
- Mobile responsiveness

### Integration Expansions
- Additional DEX support
- More technical indicators
- Social trading features
- Performance analytics

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Install dependencies: `yarn install-all`
3. Create feature branch
4. Make changes with tests
5. Submit pull request

### Code Standards
- TypeScript strict mode
