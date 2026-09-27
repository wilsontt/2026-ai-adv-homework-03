const { generateCollection } = require('../src/postman/generator');

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

describe('Postman collection generator', () => {
  it('converts openapi.json into a named Postman collection with a baseUrl variable', async () => {
    const collection = await generateCollection();

    expect(collection.info.name).toBe('E-Commerce Demo API');
    const baseUrlVar = collection.variable.find((v) => v.key === 'baseUrl');
    expect(baseUrlVar).toBeDefined();
  });

  it('attaches a test script to POST /api/auth/login that writes the token into bearerToken', async () => {
    const collection = await generateCollection();
    const [loginItem] = findItemsByPath(collection.item, 'api/auth/login', 'POST');

    expect(loginItem).toBeDefined();
    const testEvent = loginItem.event.find((e) => e.listen === 'test');
    expect(testEvent).toBeDefined();
    expect(testEvent.script.exec.join('\n')).toContain("pm.environment.set('bearerToken'");
  });

  it('attaches the same test script to POST /api/auth/register', async () => {
    const collection = await generateCollection();
    const [registerItem] = findItemsByPath(collection.item, 'api/auth/register', 'POST');

    expect(registerItem).toBeDefined();
    const testEvent = registerItem.event.find((e) => e.listen === 'test');
    expect(testEvent).toBeDefined();
    expect(testEvent.script.exec.join('\n')).toContain("pm.environment.set('bearerToken'");
  });

  it('rewrites the login request body to use {{adminEmail}} / {{adminPassword}}', async () => {
    const collection = await generateCollection();
    const [loginItem] = findItemsByPath(collection.item, 'api/auth/login', 'POST');

    expect(loginItem.request.body.raw).toContain('{{adminEmail}}');
    expect(loginItem.request.body.raw).toContain('{{adminPassword}}');
  });

  it('wires protected endpoints to bearer auth using {{bearerToken}}', async () => {
    const collection = await generateCollection();
    const [profileItem] = findItemsByPath(collection.item, 'api/auth/profile', 'GET');

    expect(profileItem.request.auth.type).toBe('bearer');
    expect(profileItem.request.auth.bearer.find((b) => b.key === 'token').value).toBe('{{bearerToken}}');
  });
});
