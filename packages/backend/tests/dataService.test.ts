import { DataService } from '../src/services/dataService';
import { Timeframe } from 'shared';

// Mock axios
jest.mock('axios');

describe('DataService', () => {
  let dataService: DataService;

  beforeEach(() => {
    dataService = new DataService();
  });

  describe('getKlineData', () => {
    it('should return formatted kline data', async () => {
      const mockResponse = {
        data: [
          [1640995200000, '50000', '51000', '49000', '50500', '1000', 1640995260000]
        ]
      };

      // Mock axios response
      const axios = require('axios');
      axios.get.mockResolvedValue(mockResponse);

      const result = await dataService.getKlineData('SOLUSDT', '1h' as Timeframe, 100);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        openTime: 1640995200000,
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
        volume: 1000,
        closeTime: 1640995260000
      });
    });
  });

  describe('getCurrentPrice', () => {
    it('should return current price', async () => {
      const mockResponse = {
        data: { price: '100.50' }
      };

      const axios = require('axios');
      axios.get.mockResolvedValue(mockResponse);

      const price = await dataService.getCurrentPrice('SOLUSDT');

      expect(price).toBe(100.50);
    });
  });
});
