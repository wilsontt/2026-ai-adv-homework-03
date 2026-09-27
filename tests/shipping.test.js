const {
  calculateShippingFee,
  SHIPPING_METHODS,
  REMOTE_AREA_SURCHARGE,
  RUSH_DELIVERY_SURCHARGE,
  FREE_BASE_SHIPPING_THRESHOLD
} = require('../src/utils/shipping');

describe('calculateShippingFee', () => {
  it('宅配基本運費為 120', () => {
    expect(calculateShippingFee({ shippingMethod: 'home_delivery', subtotal: 500 })).toBe(120);
  });

  it('超商取貨基本運費為 60', () => {
    expect(calculateShippingFee({ shippingMethod: 'convenience_store', subtotal: 500 })).toBe(60);
  });

  it('商品小計 1,499 元仍需支付基本運費', () => {
    expect(calculateShippingFee({ shippingMethod: 'home_delivery', subtotal: 1499 })).toBe(120);
    expect(calculateShippingFee({ shippingMethod: 'convenience_store', subtotal: 1499 })).toBe(60);
  });

  it('商品小計恰為 1,500 元免除基本運費', () => {
    expect(calculateShippingFee({ shippingMethod: 'home_delivery', subtotal: 1500 })).toBe(0);
    expect(calculateShippingFee({ shippingMethod: 'convenience_store', subtotal: 1500 })).toBe(0);
  });

  it('偏遠地區加收 200 元', () => {
    expect(calculateShippingFee({ shippingMethod: 'home_delivery', subtotal: 500, isRemoteArea: true })).toBe(320);
  });

  it('當日急件加收 250 元', () => {
    expect(calculateShippingFee({ shippingMethod: 'home_delivery', subtotal: 500, isRushDelivery: true })).toBe(370);
  });

  it('偏遠地區與當日急件可同時成立並疊加', () => {
    expect(
      calculateShippingFee({ shippingMethod: 'convenience_store', subtotal: 500, isRemoteArea: true, isRushDelivery: true })
    ).toBe(60 + 200 + 250);
  });

  it('滿額免運時，偏遠地區與急件附加費仍需支付', () => {
    expect(
      calculateShippingFee({ shippingMethod: 'home_delivery', subtotal: 1500, isRemoteArea: true, isRushDelivery: true })
    ).toBe(0 + 200 + 250);
  });

  it('未知的配送方式會拋出例外', () => {
    expect(() => calculateShippingFee({ shippingMethod: 'drone', subtotal: 500 })).toThrow();
  });

  it('匯出的常數與規格一致', () => {
    expect(SHIPPING_METHODS).toEqual({ home_delivery: 120, convenience_store: 60 });
    expect(REMOTE_AREA_SURCHARGE).toBe(200);
    expect(RUSH_DELIVERY_SURCHARGE).toBe(250);
    expect(FREE_BASE_SHIPPING_THRESHOLD).toBe(1500);
  });
});
