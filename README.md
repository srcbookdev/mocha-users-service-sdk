# @getmocha/users-service

An SDK for interacting with the Mocha Users Service, providing authentication and user management functionality for Hono and React applications.

## Installation

```bash
npm install @getmocha/users-service
```

## Features

- Google OAuth authentication via the Mocha Users Service
- Session management
- User information retrieval
- Hono middleware for protected routes
- A React context provider and associated hook for managing user and authentication state in React apps.

## Usage

### Backend Authentication Flow

Use the @getmocha/users-service/backend export for backend functionality and Hono support.

1. **Get OAuth Redirect URL**

```typescript
import { getOAuthRedirectUrl } from '@getmocha/users-service/backend';

// In your API handler
app.get('/api/oauth/google/redirect_url', async (c) => {
  const redirectUrl = await getOAuthRedirectUrl('google', {
    apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
    apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
  });

  return c.json({ redirectUrl }, 200);
});
```

2. **Exchange Code for Session Token**

```typescript
import {
  exchangeCodeForSessionToken,
  MOCHA_SESSION_TOKEN_COOKIE_NAME,
} from '@getmocha/users-service/backend';
import { setCookie } from 'hono/cookie';

// In your API handler for the callback
app.post('/api/sessions', async (c) => {
  const { code } = await c.req.json();

  const sessionToken = await exchangeCodeForSessionToken(code, {
    apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
    apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
  });

  // Set the session cookie
  setCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    path: '/',
    sameSite: 'none',
    secure: true,
    maxAge: 60 * 24 * 60 * 60, // 60 days
  });

  return c.json({ success: true });
});
```

3. **Protect Routes with Auth Middleware**

```typescript
import { authMiddleware } from '@getmocha/users-service/backend';
import { Hono } from 'hono';

// Create your Hono app
const app = new Hono();

// Use the middleware to protect routes
app.get('/api/protected-route', authMiddleware, async (c) => {
  // The user is available in the context
  const user = c.get('user');

  return c.json({ message: `Hello, ${user.email}!` });
});
```

4. **Get Current User**

```typescript
import { authMiddleware } from '@getmocha/users-service/backend';
import { Hono } from 'hono';

// Create your Hono app
const app = new Hono();

app.get('/api/users/me', authMiddleware, async (c) => {
  const user = c.get('user');
  return c.json(user);
});
```

5. **Logout**

```typescript
import { deleteSession } from '@getmocha/users-service/backend';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

// Create your Hono app
const app = new Hono();

app.get('/api/logout', async (c) => {
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);

  if (typeof sessionToken === 'string') {
    await deleteSession(sessionToken, {
      apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
      apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
    });
  }

  // Delete cookie by setting max age to 0 These params must match the ones
  // used when setting the cookie, except max age (0) and the cookie value ('').
  setCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME, '', {
    httpOnly: true,
    path: '/',
    sameSite: 'none',
    secure: true,
    maxAge: 0,
  });

  return c.json({ success: true }, 200);
});
```

### Shared

Use the @getmocha/users-service/shared export for functionality that can be used on the frontend or backend.

For example, the `MochaUser` TypeScript type.

```typescript
import type { MochaUser } from '@getmocha/users-service/shared';
import { Hono } from 'hono';

type Variables = {
  user?: MochaUser;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
```

### Frontend React package

Use the @getmocha/users-service/react export for a React context provider and hook that provides user and authentication management.

```tsx
import { AuthProvider } from '@getmocha/users-service/react';

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
```

Then you can use the exported `useAuth` hook.

```tsx
const {
  user,
  isPending,
  isFetching,
  fetchUser,
  redirectToUrl,
  exchangeCodeForSessionToken,
  logout,
} = useAuth();
```
