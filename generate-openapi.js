const fs = require('fs');
const SwaggerParser = require('swagger-parser');
const { generateDocument } = require('./src/openapi/generator');

(async () => {
  const document = generateDocument();
  // SwaggerParser.validate 會就地解引用/修改輸入物件，故傳入深拷貝以保留原始 document 供寫檔使用
  await SwaggerParser.validate(JSON.parse(JSON.stringify(document)));
  fs.writeFileSync('openapi.json', JSON.stringify(document, null, 2));
  console.log('openapi.json generated and validated successfully');
})().catch((err) => {
  console.error('OpenAPI 產生失敗：', err.message);
  process.exit(1);
});
