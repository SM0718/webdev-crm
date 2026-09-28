// Verifies buildAtlasUri() against the real shapes we care about.
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/webdev-crm';
process.env.JWT_SECRET = 'test_secret_value';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'adminPass123';

const { buildAtlasUri, env } = await import('../src/env.js');

test('normalises the CORS allow-list', () => {
  const { CLIENT_URLS } = env;
  assert.ok(Array.isArray(CLIENT_URLS));
  for (const origin of CLIENT_URLS) {
    assert.equal(origin, origin.trim(), 'no surrounding whitespace');
    assert.ok(!origin.endsWith('/'), 'no trailing slash, or the browser Origin header will not match');
    assert.ok(!origin.includes(','), 'entries are split apart');
  }
});

test('injects credentials, database name and write concern', () => {
  const uri = buildAtlasUri({
    uri: 'mongodb+srv://cluster0.xxxxx.mongodb.net',
    username: 'db_user',
    password: 'p@ss word',
    dbName: 'webdev-crm',
  });
  assert.equal(
    uri,
    'mongodb+srv://db_user:p%40ss%20word@cluster0.xxxxx.mongodb.net/webdev-crm?retryWrites=true&w=majority',
  );
});

test('keeps credentials, database and query string that are already present', () => {
  const uri = buildAtlasUri({
    uri: 'mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/other-db?tls=true',
    username: 'ignored',
    password: 'ignored',
    dbName: 'webdev-crm',
  });
  assert.equal(uri, 'mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/other-db?tls=true');
});

test('tolerates a trailing slash and shell-style quotes', () => {
  const uri = buildAtlasUri({
    uri: '"mongodb+srv://cluster0.xxxxx.mongodb.net/"',
    username: '"db_user"',
    password: '"secret"',
    dbName: 'webdev-crm',
  });
  assert.equal(uri, 'mongodb+srv://db_user:secret@cluster0.xxxxx.mongodb.net/webdev-crm?retryWrites=true&w=majority');
});

test('returns null when credentials are missing so the caller can fall back', () => {
  assert.equal(buildAtlasUri({ uri: 'mongodb+srv://cluster0.xxxxx.mongodb.net', dbName: 'x' }), null);
});

test('returns null for a value that is not a connection string', () => {
  assert.equal(buildAtlasUri({ uri: 'cluster0.xxxxx.mongodb.net', username: 'a', password: 'b', dbName: 'x' }), null);
});
