const SHIPPING_METHODS = {
  home_delivery: 120,
  convenience_store: 60
};

const REMOTE_AREA_SURCHARGE = 200;
const RUSH_DELIVERY_SURCHARGE = 250;
const FREE_BASE_SHIPPING_THRESHOLD = 1500;

function calculateShippingFee({ shippingMethod, subtotal, isRemoteArea = false, isRushDelivery = false }) {
  if (!Object.prototype.hasOwnProperty.call(SHIPPING_METHODS, shippingMethod)) {
    throw new Error(`未知的配送方式：${shippingMethod}`);
  }
  const baseFee = subtotal >= FREE_BASE_SHIPPING_THRESHOLD ? 0 : SHIPPING_METHODS[shippingMethod];
  const remoteFee = isRemoteArea ? REMOTE_AREA_SURCHARGE : 0;
  const rushFee = isRushDelivery ? RUSH_DELIVERY_SURCHARGE : 0;
  return baseFee + remoteFee + rushFee;
}

module.exports = {
  calculateShippingFee,
  SHIPPING_METHODS,
  REMOTE_AREA_SURCHARGE,
  RUSH_DELIVERY_SURCHARGE,
  FREE_BASE_SHIPPING_THRESHOLD
};
