import { TradingService } from '../services/tradingService';

async function testBalanceCompression() {
  try {
    console.log('Starting balance compression test...');
    
    // Create a TradingService instance
    const tradingService = new TradingService();
    
    // Simulate adding old balance entries (older than 24h)
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const twoDaysAgo = now - (48 * 60 * 60 * 1000);
    
    // Add some test data (simulating entries from 2 days ago)
    for (let i = 0; i < 50; i++) {
      const timestamp = twoDaysAgo + (i * 5 * 60 * 1000); // Every 5 minutes
      (tradingService as any).balanceHistory.push({
        timestamp,
        balance: 1000 + Math.random() * 100,
        balanceUsd: 1000 + Math.random() * 100,
      });
    }
    
    // Add some recent data (last 24h)
    for (let i = 0; i < 20; i++) {
      const timestamp = oneDayAgo + (i * 60 * 60 * 1000); // Every hour
      (tradingService as any).balanceHistory.push({
        timestamp,
        balance: 1100 + Math.random() * 100,
        balanceUsd: 1100 + Math.random() * 100,
      });
    }
    
    console.log(`Total entries before compression: ${(tradingService as any).balanceHistory.length}`);
    
    // Test compression
    await (tradingService as any).compressOldBalanceHistory();
    
    console.log(`Total entries after compression: ${(tradingService as any).balanceHistory.length}`);
    
    // Get recent data
    const recentData = await tradingService.getBalanceHistoryForRange(24);
    console.log(`Recent 24h entries: ${recentData.length}`);
    
    // Get all data
    const allData = await tradingService.getBalanceHistory();
    console.log(`All entries: ${allData.length}`);
    
    // Check for compressed entries
    const compressedEntries = allData.filter((entry: any) => entry.isCompressed);
    console.log(`Compressed entries: ${compressedEntries.length}`);
    
    console.log('Balance compression test completed successfully!');
    
  } catch (error) {
    console.error('Balance compression test failed:', error);
  }
}

testBalanceCompression();
