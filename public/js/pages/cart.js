const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    const items = ref([]);
    const loading = ref(true);
    const confirmVisible = ref(false);
    const deleteItemId = ref('');

    var HOME_DELIVERY_BASE_FEE = 120;
    var FREE_BASE_SHIPPING_THRESHOLD = 1500;

    const total = computed(function () {
      return items.value.reduce(function (sum, item) {
        return sum + item.product.price * item.quantity;
      }, 0);
    });

    const qualifiesForFreeShipping = computed(function () {
      return total.value >= FREE_BASE_SHIPPING_THRESHOLD;
    });

    const shippingFee = computed(function () {
      return qualifiesForFreeShipping.value ? 0 : HOME_DELIVERY_BASE_FEE;
    });

    const amountToFreeShipping = computed(function () {
      return FREE_BASE_SHIPPING_THRESHOLD - total.value;
    });

    const grandTotal = computed(function () {
      return total.value + shippingFee.value;
    });

    async function loadCart() {
      loading.value = true;
      try {
        const res = await apiFetch('/api/cart');
        items.value = res.data.items;
      } catch (e) {
        Notification.show('載入購物車失敗', 'error');
      } finally {
        loading.value = false;
      }
    }

    async function updateQuantity(itemId, qty) {
      if (qty < 1) return;
      try {
        await apiFetch('/api/cart/' + itemId, {
          method: 'PATCH',
          body: JSON.stringify({ quantity: qty })
        });
        var item = items.value.find(function (i) { return i.id === itemId; });
        if (item) item.quantity = qty;
      } catch (e) {
        Notification.show('更新數量失敗', 'error');
      }
    }

    function confirmDelete(itemId) {
      deleteItemId.value = itemId;
      confirmVisible.value = true;
    }

    async function handleDelete() {
      confirmVisible.value = false;
      try {
        await apiFetch('/api/cart/' + deleteItemId.value, { method: 'DELETE' });
        items.value = items.value.filter(function (i) { return i.id !== deleteItemId.value; });
        Notification.show('已從購物車移除', 'success');
      } catch (e) {
        Notification.show('移除失敗', 'error');
      }
    }

    function goCheckout() {
      if (!Auth.isLoggedIn()) {
        window.location.href = '/login?redirect=/checkout';
        return;
      }
      window.location.href = '/checkout';
    }

    onMounted(function () {
      loadCart();
    });

    return {
      items, loading, total, qualifiesForFreeShipping, shippingFee,
      amountToFreeShipping, grandTotal, confirmVisible,
      updateQuantity, confirmDelete, handleDelete, goCheckout
    };
  }
}).mount('#app');
