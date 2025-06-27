import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { MochaUser } from '@getmocha/users-service/shared';

export interface AuthContextValue {
  /**
   * The currently authenticated user from the Mocha Users Service, or null if not authenticated.
   * Use this both for checking authentication status and accessing user data.
   */
  user: MochaUser | null;

  /**
   * Makes a GET request to /api/users/me to get the current user.
   * If the user is authenticated, the `user` object will be updated
   * with the current user's data. Otherwise, `user` will be `null`.
   */
  loadUser: () => Promise<void>;

  /**
   * Makes a GET request to /api/oauth/google/redirect_url to get the login redirect URL.
   * It then redirects the user to the url returned in the response to initiate the OAuth flow.
   */
  redirectToLogin: () => Promise<void>;

  /**
   * Makes a POST request to /api/sessions with the exchange code in the request body.
   * This function is expected to be used after the user completes the OAuth flow and is
   * redirected back to /auth/callback?code=<exchange_code>. It expects a `code` query parameter
   * in the URL. Use this only on the /auth/callback page. Once this function completes successfully,
   * the user state will be updated with the currently authenticated user's data.
   */
  exchangeCodeForSessionToken: () => Promise<void>;

  /**
   * Makes a GET request to /api/logout to log the user out.
   * The `user` object will be set to `null`.
   */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * A React context provider that manages authentication state and related actions.
 * Install this at the top of the React component tree to provide authentication
 * and user management functionality. This is needed for the `useAuth` hook to work.
 *
 * This provider does not call `loadUser` when mounted. You must explicitly call `loadUser` to
 * initialize the current user and check authentication status.
 *
 * @example
 * import { AuthProvider } from '@getmocha/users-service/react';
 *
 * // React Router example
 * export default function App() {
 *   return (
 *     <AuthProvider>
 *       <Router>
 *         <Routes>
 *           <Route path="/" element={<HomePage />} />
 *           <Route path="/auth/callback" element={<AuthCallbackPage />} />
 *         </Routes>
 *       </Router>
 *     </AuthProvider>
 *   );
 * }
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MochaUser | null>(null);
  const userRef = useRef<Promise<void> | null>(null);
  const exchangeRef = useRef<Promise<void> | null>(null);

  const loadUser = useCallback(async () => {
    if (userRef.current) return userRef.current;

    userRef.current = (async () => {
      try {
        const response = await fetch('/api/users/me');
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
        setUser(null);
      }
    })();

    return userRef.current;
  }, []);

  const logout = useCallback(async () => {
    try {
      setUser(null);
      await fetch('/api/logout');
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  }, []);

  const redirectToLogin = useCallback(async () => {
    try {
      const response = await fetch('/api/oauth/google/redirect_url');

      if (!response.ok) {
        throw new Error(
          `Failed to get login redirect URL: API responded with HTTP status ${response.status}`
        );
      }

      const { redirectUrl } = await response.json();
      window.location.href = redirectUrl;
    } catch (error) {
      console.error(error);
    }
  }, []);

  const exchangeCodeForSessionToken = useCallback(() => {
    // Ensure we only exchange the code once. In dev, useEffect will run
    // twice, so we need to reuse this promise to avoid multiple exchanges
    // which would otherwise result in a failed request. The failed request
    // sometimes causes the entire flow to break.
    if (exchangeRef.current) return exchangeRef.current;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (!code) {
      throw new Error(
        'Cannot exchange code for session token: no code provided in the URL search params.'
      );
    }

    exchangeRef.current = (async (code: string) => {
      try {
        const response = await fetch('/api/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          throw new Error(
            `Failed to exchange code for session token: API responded with HTTP status ${response.status}`
          );
        }

        // Refetch user after successful code exchange to populate user state
        await loadUser();
      } catch (error) {
        console.error(error);
      }
    })(code);

    return exchangeRef.current;
  }, [loadUser]);

  const contextValue: AuthContextValue = {
    user,
    logout,
    loadUser,
    redirectToLogin,
    exchangeCodeForSessionToken,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

/**
 * A React hook that provides the AuthContextValue.
 * @example
 * const { user } = useAuth();
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within a AuthProvider');
  }
  return context;
}
