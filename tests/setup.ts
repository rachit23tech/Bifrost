// Imported first by every test file. It must run before any server module is
// loaded, because the database connection is opened at import time.
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
