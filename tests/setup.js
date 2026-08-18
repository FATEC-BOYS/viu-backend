"use strict";
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://localhost:5432/viu_test';
process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-characters-000';
process.env.R2_ENDPOINT = 'https://r2.example.com';
process.env.R2_ACCESS_KEY_ID = 'test-r2-key-id';
process.env.R2_SECRET_ACCESS_KEY = 'test-r2-secret-key';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.MP_ACCESS_TOKEN = '';
process.env.MP_WEBHOOK_SECRET = '';
//# sourceMappingURL=setup.js.map