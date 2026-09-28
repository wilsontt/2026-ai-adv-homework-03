const fs = require('fs');
const path = require('path');
const Converter = require('openapi-to-postmanv2');

const TOKEN_CAPTURE_SCRIPT = [
  "if ([200, 201].includes(pm.response.code)) {",
  "  const body = pm.response.json();",
  "  if (body && body.data && body.data.token) {",
  "    pm.environment.set('token', body.data.token);",
  "  }",
  "}"
];

function convert(openapiData) {
  return new Promise((resolve, reject) => {
    Converter.convert({ type: 'string', data: openapiData }, {}, (err, result) => {
      if (err) return reject(err);
      if (!result.result) return reject(new Error(result.reason));
      resolve(result.output[0].data);
    });
  });
}

function findItemsByPath(items, targetPath, method) {
  const matches = [];
  for (const it of items) {
    if (it.item) {
      matches.push(...findItemsByPath(it.item, targetPath, method));
    } else if (
      it.request &&
      it.request.method === method &&
      Array.isArray(it.request.url && it.request.url.path) &&
      it.request.url.path.join('/') === targetPath
    ) {
      matches.push(it);
    }
  }
  return matches;
}

function attachTokenCapture(collection) {
  const targets = [
    ['api/auth/login', 'POST'],
    ['api/auth/register', 'POST']
  ];
  for (const [urlPath, method] of targets) {
    for (const item of findItemsByPath(collection.item, urlPath, method)) {
      item.event = item.event || [];
      item.event.push({
        listen: 'test',
        script: { type: 'text/javascript', exec: TOKEN_CAPTURE_SCRIPT }
      });
    }
  }
}

function renameBearerVariable(items) {
  for (const it of items) {
    if (it.item) {
      renameBearerVariable(it.item);
    } else if (it.request && it.request.auth && it.request.auth.type === 'bearer') {
      it.request.auth.bearer = it.request.auth.bearer.map((entry) =>
        entry.key === 'token' && entry.value === '{{bearerToken}}'
          ? { ...entry, value: '{{token}}' }
          : entry
      );
    }
  }
}

function setLoginBodyToEnvVars(collection) {
  for (const item of findItemsByPath(collection.item, 'api/auth/login', 'POST')) {
    item.request.body = {
      mode: 'raw',
      raw: JSON.stringify({ email: '{{adminEmail}}', password: '{{adminPassword}}' }, null, 2),
      options: { raw: { language: 'json' } }
    };
  }
}

async function generateCollection() {
  const openapiPath = path.join(__dirname, '..', '..', 'openapi.json');
  const openapiData = fs.readFileSync(openapiPath, 'utf8');
  const collection = await convert(openapiData);

  attachTokenCapture(collection);
  renameBearerVariable(collection.item);
  setLoginBodyToEnvVars(collection);

  return collection;
}

module.exports = { generateCollection };
