describe('integration test environment', () => {
  it('runs against an in-memory database, not the real database.sqlite', () => {
    expect(process.env.DATABASE_PATH).toBe(':memory:');
    const db = require('../../src/database');
    const productCount = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
    expect(productCount).toBe(8); // 種子資料剛建立，僅有 8 個商品，證明是全新的記憶體 DB
  });
});
