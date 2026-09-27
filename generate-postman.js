const fs = require('fs');
const path = require('path');
const { generateCollection } = require('./src/postman/generator');

(async () => {
  const collection = await generateCollection();
  const outDir = path.join(__dirname, 'postman');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'collection.json'), JSON.stringify(collection, null, 2));
  console.log('postman/collection.json generated successfully');
})().catch((err) => {
  console.error('Postman Collection 產生失敗：', err.message);
  process.exit(1);
});
