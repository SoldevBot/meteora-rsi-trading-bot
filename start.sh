#!/bin/bash

# Meteora Trading Bot Setup and Start Script

echo "🌟 Meteora Trading Bot Setup 🌟"
echo "================================"

# Check if Node.js and Yarn are installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

if ! command -v yarn &> /dev/null; then
    echo "❌ Yarn is not installed. Please install Yarn first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ Yarn version: $(yarn --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
yarn install-all

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"
echo ""

# Check for environment files
echo "🔧 Checking environment configuration..."

if [ ! -f "packages/backend/.env" ]; then
    echo "⚠️  Backend .env file not found. Copying from example..."
    cp packages/backend/.env.example packages/backend/.env
    echo "📝 Please edit packages/backend/.env with your API keys and wallet settings"
fi

if [ ! -f "packages/frontend/.env" ]; then
    echo "⚠️  Frontend .env file not found. Copying from example..."
    cp packages/frontend/.env.example packages/frontend/.env
fi

echo "✅ Environment files ready"
echo ""

# Security warning
echo "🛡️  SECURITY WARNING 🛡️"
echo "========================"
echo "⚠️  NEVER use your main wallet seed phrase!"
echo "⚠️  Use ONLY test wallets for development!"
echo "⚠️  Start with Devnet/Testnet before mainnet!"
echo "⚠️  This bot is for educational purposes!"
echo ""

# Build the project
echo "🔨 Building the project..."
yarn build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Project built successfully"
echo ""

# Start the application
echo "🚀 Starting Meteora Trading Bot..."
echo "📊 Backend will run on: http://localhost:3001"
echo "🖥️  Frontend will run on: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop the bot"
echo ""

# Start both backend and frontend
yarn dev
