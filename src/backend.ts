/// <reference types="hono" />

import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { MochaUser } from '@getmocha/users-service/shared';

export interface MochaUsersServiceOptions {
  apiUrl?: string;
  apiKey: string;
}

export const DEFAULT_MOCHA_USERS_SERVICE_API_URL = 'https://getmocha.com/u' as const;
export const MOCHA_SESSION_TOKEN_COOKIE_NAME = 'mocha_session_token' as const;
export const SUPPORTED_OAUTH_PROVIDERS = ['google'] as const;
export type OAuthProvider = (typeof SUPPORTED_OAUTH_PROVIDERS)[number];

declare module 'hono' {
  interface ContextVariableMap {
    user?: MochaUser;
  }
}

/**
 * Fetch the OAuth redirect URL from the Mocha Users Service.
 * @param provider - The OAuth provider to use (currently only "google" is supported)
 * @param options - Configuration options including API key and optional API URL
 * @returns The redirect URL to initiate the OAuth flow
 */
export async function getOAuthRedirectUrl(
  provider: OAuthProvider,
  options: MochaUsersServiceOptions
): Promise<string> {
  if (!SUPPORTED_OAUTH_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported OAuth provider: ${provider}`);
  }

  const apiUrl = options.apiUrl || DEFAULT_MOCHA_USERS_SERVICE_API_URL;

  const response = await fetch(`${apiUrl}/oauth/${provider}/redirect_url`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': options.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get redirect URL for provider ${provider}: ${response.statusText}`);
  }

  const { redirect_url } = await response.json();

  return redirect_url;
}

/**
 * Exchanges a code for a session token using the Mocha Users Service.
 * @param code - The OAuth code received after successful authentication
 * @param options - Configuration options including API key and optional API URL
 * @returns The session token to use for authenticated requests
 */
export async function exchangeCodeForSessionToken(
  code: string,
  options: MochaUsersServiceOptions
): Promise<string> {
  const apiUrl = options.apiUrl || DEFAULT_MOCHA_USERS_SERVICE_API_URL;

  const response = await fetch(`${apiUrl}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': options.apiKey,
    },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new Error(`Failed to exchange code for session token: ${response.statusText}`);
  }

  const { session_token } = await response.json();

  return session_token;
}

/**
 * Fetch the current user by their session token from the Mocha Users Service.
 * @param sessionToken - The session token obtained from exchangeCodeForSessionToken
 * @param options - Configuration options including API key and optional API URL
 * @returns The user object or null if the session is invalid
 */
export async function getCurrentUser(
  sessionToken: string,
  options: MochaUsersServiceOptions
): Promise<MochaUser | null> {
  const apiUrl = options.apiUrl || DEFAULT_MOCHA_USERS_SERVICE_API_URL;

  try {
    const response = await fetch(`${apiUrl}/users/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'x-api-key': options.apiKey,
      },
    });

    if (!response.ok) {
      return null;
    }

    const { data: user } = await response.json();

    return user;
  } catch (error) {
    console.error('Error validating session:', error);
    return null;
  }
}

/**
 * Delete the current session in the Mocha Users Service when logging out.
 * @param sessionToken - The users session token from their cookie.
 * @param options - Configuration options including API key and optional API URL
 */
export async function deleteSession(
  sessionToken: string,
  options: MochaUsersServiceOptions
): Promise<void> {
  const apiUrl = options.apiUrl || DEFAULT_MOCHA_USERS_SERVICE_API_URL;

  try {
    await fetch(`${apiUrl}/sessions`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'x-api-key': options.apiKey,
      },
    });
  } catch (error) {
    console.error('Error deleting session:', error);
  }
}

/**
 * Hono middleware that authenticates requests against the Mocha Users Service.
 *
 * This middleware requests the current user using the session token stored in
 * cookies. If the request fails to return a valid user object, the middleware
 * throws an HTTPException with status 401. On success, it sets the authenticated
 * user in the Hono context for use in subsequent route handlers.
 *
 * Use this to protect routes and load the current user.
 *
 * @throws {HTTPException} 401 - When session token is invalid or not provided
 *
 * @example
 *
 * // Fetch the authenticated user's todos.
 * // Doesn't execute if the user is not authenticated.
 * app.get("/api/todos", authMiddleware, async (c) => {
 *   const user = c.get("user");
 *
 *   const { results } = await c.env.DB.prepare(
 *     "SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC"
 *   )
 *     .bind(user.id)
 *     .all();
 *
 *   return c.json(results);
 * });
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);

  if (typeof sessionToken !== 'string') {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const options: MochaUsersServiceOptions = {
    apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL,
    apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY,
  };

  const user = await getCurrentUser(sessionToken, options);

  if (!user) {
    throw new HTTPException(401, { message: 'Invalid session token' });
  }

  c.set('user', user);

  await next();
});
