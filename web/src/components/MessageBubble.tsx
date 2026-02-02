import React from 'react'
import type { Message } from '../hooks/useWebSocket'

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isAssistant = message.sender === 'assistant'
  const isWebUser = message.sender === 'web-user'

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{
      ...styles.container,
      justifyContent: isWebUser ? 'flex-end' : 'flex-start'
    }}>
      <div style={{
        ...styles.bubble,
        ...(isWebUser ? styles.userBubble : isAssistant ? styles.assistantBubble : styles.otherBubble)
      }}>
        {!isWebUser && !isAssistant && (
          <div style={styles.senderName}>{message.sender_name}</div>
        )}
        <div style={styles.content}>{message.content}</div>
        <div style={styles.meta}>
          <span style={styles.time}>{formatTime(message.timestamp)}</span>
          {message.source === 'whatsapp' && (
            <span style={styles.source}>WhatsApp</span>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    marginBottom: '8px',
    paddingLeft: '16px',
    paddingRight: '16px'
  },
  bubble: {
    maxWidth: '70%',
    padding: '10px 14px',
    borderRadius: '18px',
    wordBreak: 'break-word'
  },
  userBubble: {
    background: '#007AFF',
    color: 'white',
    borderBottomRightRadius: '4px'
  },
  assistantBubble: {
    background: '#E9E9EB',
    color: '#1C1C1E',
    borderBottomLeftRadius: '4px'
  },
  otherBubble: {
    background: '#F2F2F7',
    color: '#1C1C1E',
    borderBottomLeftRadius: '4px'
  },
  senderName: {
    fontSize: '12px',
    fontWeight: 600,
    marginBottom: '4px',
    color: '#8E8E93'
  },
  content: {
    fontSize: '16px',
    lineHeight: 1.4,
    whiteSpace: 'pre-wrap'
  },
  meta: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '6px',
    marginTop: '4px'
  },
  time: {
    fontSize: '11px',
    opacity: 0.7
  },
  source: {
    fontSize: '10px',
    opacity: 0.5,
    textTransform: 'uppercase'
  }
}
