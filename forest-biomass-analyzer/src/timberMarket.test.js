import {
  calculatePriceRange,
  analyzeHarvestDelay,
  generateSaleSheet,
  TIMBER_PRICE_RANGES,
  ENERGY_WOOD_PRICE,
  STANDING_SALE_DISCOUNT
} from './timberMarket';

describe('calculatePriceRange', () => {
  test('returns low < avg < high for all species', () => {
    ['pine', 'fir', 'birch', 'aspen'].forEach(type => {
      const result = calculatePriceRange(150, type, 50, 10);
      expect(result.low).toBeLessThan(result.avg);
      expect(result.avg).toBeLessThan(result.high);
    });
  });

  test('standing sale is discounted from delivery sale', () => {
    const result = calculatePriceRange(150, 'pine', 50, 10);
    expect(result.standingSaleAvg).toBeCloseTo(result.deliverySaleAvg * STANDING_SALE_DISCOUNT, 0);
  });

  test('scales with area', () => {
    const small = calculatePriceRange(150, 'pine', 50, 1);
    const large = calculatePriceRange(150, 'pine', 50, 10);
    expect(large.avg).toBeCloseTo(small.avg * 10, 0);
  });

  test('sawlog fraction increases with age', () => {
    const young = calculatePriceRange(150, 'pine', 25, 10);
    const old = calculatePriceRange(150, 'pine', 70, 10);
    expect(old.sawlogFraction).toBeGreaterThan(young.sawlogFraction);
  });

  test('aspen has zero sawlog fraction', () => {
    const result = calculatePriceRange(150, 'aspen', 50, 10);
    expect(result.sawlogFraction).toBe(0);
  });

  test('includes energy wood volume', () => {
    const result = calculatePriceRange(150, 'pine', 50, 10);
    expect(result.energyWoodVolume).toBeGreaterThan(0);
  });

  test('volume breakdown sums correctly', () => {
    const result = calculatePriceRange(150, 'pine', 50, 10);
    const totalMerchantable = result.sawlogVolume + result.pulpwoodVolume;
    const totalWithEnergy = totalMerchantable + result.energyWoodVolume;
    expect(totalWithEnergy).toBeCloseTo(result.volumePerHa, 1);
  });

  test('zero biomass returns zero values', () => {
    const result = calculatePriceRange(0, 'pine', 50, 10);
    expect(result.avg).toBe(0);
    expect(result.volumePerHa).toBe(0);
  });
});

describe('analyzeHarvestDelay', () => {
  test('returns projections for default delay years', () => {
    const result = analyzeHarvestDelay('pine', 40, 10);
    expect(result.projections).toHaveLength(3);
    expect(result.projections[0].delayYears).toBe(1);
    expect(result.projections[1].delayYears).toBe(3);
    expect(result.projections[2].delayYears).toBe(5);
  });

  test('discounted value is less than nominal value', () => {
    const result = analyzeHarvestDelay('pine', 40, 10);
    result.projections.forEach(p => {
      expect(p.discountedValue).toBeLessThanOrEqual(p.nominalValue);
    });
  });

  test('nominal value increases with delay for young forests', () => {
    const result = analyzeHarvestDelay('pine', 30, 10);
    expect(result.projections[2].nominalValue).toBeGreaterThan(result.currentValue);
  });

  test('works for all species', () => {
    ['pine', 'fir', 'birch', 'aspen'].forEach(type => {
      const result = analyzeHarvestDelay(type, 40, 10);
      expect(result.currentValue).toBeGreaterThan(0);
      expect(result.projections).toHaveLength(3);
    });
  });

  test('accepts custom delay years', () => {
    const result = analyzeHarvestDelay('pine', 40, 10, [2, 7, 10]);
    expect(result.projections).toHaveLength(3);
    expect(result.projections[0].delayYears).toBe(2);
    expect(result.projections[2].delayYears).toBe(10);
  });
});

describe('generateSaleSheet', () => {
  test('returns complete sale sheet', () => {
    const result = generateSaleSheet(150, 'pine', 50, 10);
    expect(result.priceRange).toBeDefined();
    expect(result.harvestDelay).toBeDefined();
    expect(result.timberValue).toBeDefined();
    expect(result.summary).toBeDefined();
  });

  test('summary has correct fields', () => {
    const result = generateSaleSheet(150, 'pine', 50, 10);
    expect(result.summary.deliveryPriceRange).toMatch(/€\d+ - €\d+/);
    expect(result.summary.standingPriceRange).toMatch(/€\d+ - €\d+/);
    expect(result.summary.avgDeliveryPrice).toBeGreaterThan(0);
    expect(result.summary.avgStandingPrice).toBeGreaterThan(0);
    expect(result.summary.totalVolume).toBeGreaterThan(0);
  });

  test('standing price is less than delivery price', () => {
    const result = generateSaleSheet(150, 'pine', 50, 10);
    expect(result.summary.avgStandingPrice).toBeLessThan(result.summary.avgDeliveryPrice);
  });

  test('works for all species', () => {
    ['pine', 'fir', 'birch', 'aspen'].forEach(type => {
      const result = generateSaleSheet(150, type, 50, 10);
      expect(result.forestType).toBe(type);
      expect(result.summary.avgDeliveryPrice).toBeGreaterThan(0);
    });
  });
});

describe('constants', () => {
  test('price ranges have low/avg/high for all species', () => {
    ['pine', 'fir', 'birch', 'aspen'].forEach(type => {
      expect(TIMBER_PRICE_RANGES[type].sawlog.low).toBeLessThanOrEqual(TIMBER_PRICE_RANGES[type].sawlog.avg);
      expect(TIMBER_PRICE_RANGES[type].sawlog.avg).toBeLessThanOrEqual(TIMBER_PRICE_RANGES[type].sawlog.high);
      expect(TIMBER_PRICE_RANGES[type].pulpwood.low).toBeLessThanOrEqual(TIMBER_PRICE_RANGES[type].pulpwood.avg);
      expect(TIMBER_PRICE_RANGES[type].pulpwood.avg).toBeLessThanOrEqual(TIMBER_PRICE_RANGES[type].pulpwood.high);
    });
  });

  test('energy wood price is positive', () => {
    expect(ENERGY_WOOD_PRICE).toBeGreaterThan(0);
  });

  test('standing sale discount is between 0 and 1', () => {
    expect(STANDING_SALE_DISCOUNT).toBeGreaterThan(0);
    expect(STANDING_SALE_DISCOUNT).toBeLessThan(1);
  });
});
