import { useAuth } from './hooks/useAuth'
import { useWebSocket } from './hooks/useWebSocket'
import { LoginForm } from './components/LoginForm'
import { ChatContainer } from './components/ChatContainer'

export default function App() {
  const { isAuthenticated, isLoading, error, login, logout } = useAuth()
  const { messages, isTyping, isConnected, sendMessage } = useWebSocket(isAuthenticated)

  if (isLoading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginForm onLogin={login} error={error} isLoading={isLoading} />
  }

  return (
    <ChatContainer
      messages={messages}
      isTyping={isTyping}
      isConnected={isConnected}
      onSendMessage={sendMessage}
      onLogout={logout}
    />
  )
}

const styles: Record<string, React.CSSProperties> = {
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #E5E5EA',
    borderTopColor: '#007AFF',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  }
}

// Add global styles
const styleSheet = document.createElement('style')
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`
document.head.appendChild(styleSheet)
