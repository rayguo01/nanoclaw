import React, { useRef, useEffect } from 'react'
import { MessageBubble } from './MessageBubble'
import { MessageInput } from './MessageInput'
import type { Message } from '../hooks/useWebSocket'

interface ChatContainerProps {
  messages: Message[]
  isTyping: boolean
  isConnected: boolean
  onSendMessage: (message: string) => Promise<boolean>
  onLogout: () => void
}

export function ChatContainer({
  messages,
  isTyping,
  isConnected,
  onSendMessage,
  onLogout
}: ChatContainerProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>NanoClaw</h1>
        <div style={styles.headerRight}>
          <div style={{
            ...styles.status,
            background: isConnected ? '#34C759' : '#FF9500'
          }} />
          <button onClick={onLogout} style={styles.logoutButton}>
            Logout
          </button>
        </div>
      </header>

      <div style={styles.messagesContainer}>
        {messages.length === 0 && (
          <div style={styles.empty}>
            No messages yet. Start a conversation!
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isTyping && (
          <div style={styles.typingContainer}>
            <div style={styles.typingBubble}>
              <div style={styles.typingDots}>
                <span style={styles.dot} />
                <span style={{ ...styles.dot, animationDelay: '0.2s' }} />
                <span style={{ ...styles.dot, animationDelay: '0.4s' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <MessageInput onSend={onSendMessage} disabled={!isConnected} />

      <style>{`
        @keyframes typing {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-4px); }
        }
      `}</style>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    maxWidth: '600px',
    margin: '0 auto',
    background: 'white'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #E5E5EA',
    background: '#F8F8F8'
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#1C1C1E',
    margin: 0
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  status: {
    width: '10px',
    height: '10px',
    borderRadius: '50%'
  },
  logoutButton: {
    padding: '6px 12px',
    fontSize: '14px',
    color: '#007AFF',
    background: 'transparent',
    border: '1px solid #007AFF',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    paddingTop: '16px',
    paddingBottom: '16px'
  },
  empty: {
    textAlign: 'center',
    color: '#8E8E93',
    padding: '40px 20px',
    fontSize: '16px'
  },
  typingContainer: {
    display: 'flex',
    paddingLeft: '16px',
    paddingRight: '16px',
    marginBottom: '8px'
  },
  typingBubble: {
    background: '#E9E9EB',
    padding: '12px 16px',
    borderRadius: '18px',
    borderBottomLeftRadius: '4px'
  },
  typingDots: {
    display: 'flex',
    gap: '4px'
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#8E8E93',
    animation: 'typing 1.4s infinite ease-in-out'
  }
}
