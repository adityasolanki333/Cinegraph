import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface User {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  profileImageUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

let pendingFetch: Promise<void> | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const fetchUser = async (force = false) => {
    if (pendingFetch && !force) {
      return pendingFetch;
    }

    pendingFetch = (async () => {
      try {
        // Check for demo mode first
        const isDemoMode = localStorage.getItem('demo-mode') === 'true';
        const demoUserStr = localStorage.getItem('demo-user');
        
        if (isDemoMode && demoUserStr) {
          try {
            const demoUser = JSON.parse(demoUserStr);
            console.log('[AuthContext] Demo mode detected, using demo user');
            setAuthState({
              user: demoUser,
              isLoading: false,
              isAuthenticated: true,
            });
            return;
          } catch (parseError) {
            console.error('[AuthContext] Failed to parse demo user, clearing demo mode', parseError);
            localStorage.removeItem('demo-mode');
            localStorage.removeItem('demo-user');
          }
        }

        // If not in demo mode, check server session
        const headers: Record<string, string> = {};
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
          headers,
        });

        if (response.ok || response.status === 304) {
          const data = await response.json();
          console.log('[AuthContext] Setting auth state with user:', data.user?.id);
          setAuthState({
            user: data.user,
            isLoading: false,
            isAuthenticated: true,
          });
        } else {
          console.log('[AuthContext] Auth check failed, status:', response.status);
          setAuthState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
          });
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setAuthState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
        });
      } finally {
        pendingFetch = null;
      }
    })();

    return pendingFetch;
  };

  useEffect(() => {
    fetchUser();

    const handleAuthChange = () => {
      console.log('[AuthContext] Auth change event received, forcing fresh fetch');
      fetchUser(true);
    };

    console.log('[AuthContext] Setting up auth event listeners');
    window.addEventListener('auth-change', handleAuthChange);
    window.addEventListener('storage', handleAuthChange);

    return () => {
      console.log('[AuthContext] Cleaning up auth event listeners');
      window.removeEventListener('auth-change', handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, []);

  const contextValue: AuthContextType = {
    ...authState,
    refetchUser: fetchUser,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
