import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';
import { queryClient } from '@/lib/queryClient';

type WebSocketMessage = {
  type: 'connected' | 'notification' | 'community_update';
  userId?: string;
  data?: any;
};

export function useWebSocket() {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (!user?.id) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        reconnectAttemptsRef.current = 0;
        
        // Authenticate with user ID
        ws.send(JSON.stringify({
          type: 'auth',
          userId: user.id
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'connected':
              console.log('[WebSocket] Authenticated as', message.userId);
              break;
              
            case 'notification':
              console.log('[WebSocket] New notification received', message.data);
              // Invalidate notification queries to fetch fresh data
              queryClient.invalidateQueries({ queryKey: ['/api/community/notifications'] });
              queryClient.invalidateQueries({ queryKey: ['/api/community/notifications/unread/count'] });
              break;
              
            case 'community_update':
              console.log('[WebSocket] Community update received', message.data);
              // Invalidate community queries based on update type
              if (message.data?.type === 'review') {
                queryClient.invalidateQueries({ predicate: (query) => 
                  query.queryKey[0] === '/api/community/community-feed' ||
                  query.queryKey[0] === '/api/community/top-reviews' ||
                  query.queryKey[0] === '/api/community/trending'
                });
              } else if (message.data?.type === 'list') {
                queryClient.invalidateQueries({ predicate: (query) => 
                  query.queryKey[0] === '/api/community/community-feed' ||
                  typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/community/lists')
                });
              } else {
                // For any other update, invalidate all community queries
                queryClient.invalidateQueries({ predicate: (query) => 
                  typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/community/')
                });
              }
              break;
          }
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        wsRef.current = null;
        
        // Attempt to reconnect with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error);
    }
  }, [user?.id]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    reconnect: connect
  };
}
