import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { MochaUser } from '@getmocha/users-service/shared';

export interface AuthContextValue {
  /**
   * The currently authenticated user from the Mocha Users Service, or null if not authenticated.
   * Use this both for checking authentication status and accessing user data.
   */
  user: MochaUser | null;

  /**
   * `true` when the `AuthProvider` is fetching the `user` object on mount.
   * Use this to show initial loading states or block until knowing the authentication status.
   */
  isPending: boolean;

  /**
   * `true` any time the `user` object is being fetched.
   */
  isFetching: boolean;

  /**
   * Makes a GET request to /api/users/me to fetch the current user.
   * If the user is authenticated, the `user` object will be updated
   * with the current user's data. Otherwise, `user` will be `null`.
   */
  fetchUser: () => Promise<void>;

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
 * This will always fetch the `user` object on mount.
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

  // Use these to dedup requests. This is mostly for avoiding multiple
  // calls from useEffects in dev, which could cause wonky behavior with
  // the loading states or problems when exchanging code for session token.
  const userRef = useRef<Promise<void> | null>(null);
  const exchangeRef = useRef<Promise<void> | null>(null);

  const [isPending, setIsPending] = useState(true);
  const [isFetching, setIsFetching] = useState(false);

  const fetchUser = useCallback(async () => {
    if (userRef.current) return userRef.current;

    userRef.current = (async () => {
      setIsFetching(true);

      try {
        const response = await fetch('/api/users/me');

        if (!response.ok) {
          throw new Error(
            `Failed to fetch user: API responded with HTTP status ${response.status}`
          );
        }

        const user: MochaUser = await response.json();

        setUser(user);
      } catch (error) {
        throw error;
      } finally {
        setIsFetching(false);
        userRef.current = null;
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
        await fetchUser();
      } catch (error) {
        console.error(error);
      } finally {
        // exchangeRef is not set back to null on purpose.
        // We only expect it to run once per full page load.
        // If it's called more than once, it's either useEffect
        // on page load in dev or a bug.
      }
    })(code);

    return exchangeRef.current;
  }, [fetchUser]);

  useEffect(() => {
    fetchUser().then(
      () => setIsPending(false),
      () => setIsPending(false)
    );
  }, []);

  const contextValue: AuthContextValue = {
    user,
    isPending,
    isFetching,
    fetchUser,
    redirectToLogin,
    exchangeCodeForSessionToken,
    logout,
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
