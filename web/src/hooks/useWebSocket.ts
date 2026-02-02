import { useState, useEffect, useCallback, useRef } from 'react'

export interface Message {
  id: string
  sender: string
  sender_name: string
  content: string
  timestamp: string
  source: 'whatsapp' | 'web'
}

interface WebSocketMessage {
  type: 'message' | 'typing' | 'status' | 'connected' | 'pong'
  data?: unknown
}

export function useWebSocket(isAuthenticated: boolean) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)

  const connect = useCallback(() => {
    if (!isAuthenticated) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/ws`

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setIsConnected(true)
      // Start ping interval
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 30000)
      ws.addEventListener('close', () => clearInterval(pingInterval))
    }

    ws.onmessage = (event) => {
      try {
        const msg: WebSocketMessage = JSON.parse(event.data)

        switch (msg.type) {
          case 'message':
            setMessages(prev => [...prev, msg.data as Message])
            break
          case 'typing':
            setIsTyping((msg.data as { isTyping: boolean }).isTyping)
            break
          case 'connected':
            // Connection confirmed
            break
          case 'pong':
            // Keepalive response
            break
        }
      } catch {
        // Ignore invalid messages
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      wsRef.current = null

      // Attempt to reconnect after 3 seconds
      if (isAuthenticated) {
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect()
        }, 3000)
      }
    }

    ws.onerror = () => {
      ws.close()
    }

    wsRef.current = ws
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) {
      connect()
    } else {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [isAuthenticated, connect])

  // Load initial messages
  useEffect(() => {
    if (!isAuthenticated) return

    const loadMessages = async () => {
      try {
        const response = await fetch('/api/messages?limit=50', {
          credentials: 'include'
        })
        if (response.ok) {
          const data = await response.json()
          setMessages(data.messages.reverse())
        }
      } catch {
        // Ignore errors
      }
    }

    loadMessages()
  }, [isAuthenticated])

  const sendMessage = async (text: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: text })
      })
      return response.ok
    } catch {
      return false
    }
  }

  return {
    messages,
    isTyping,
    isConnected,
    sendMessage
  }
}
