import React, { useState, useRef, useEffect } from 'react'

interface MessageInputProps {
  onSend: (message: string) => Promise<boolean>
  disabled?: boolean
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [message])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!message.trim() || isSending || disabled) return

    const text = message.trim()
    setMessage('')
    setIsSending(true)

    try {
      await onSend(text)
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.inputContainer}>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          style={styles.textarea}
          disabled={isSending || disabled}
          rows={1}
        />
        <button
          type="submit"
          style={{
            ...styles.button,
            opacity: message.trim() && !isSending && !disabled ? 1 : 0.5
          }}
          disabled={!message.trim() || isSending || disabled}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M22 2L11 13"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M22 2L15 22L11 13L2 9L22 2Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </form>
  )
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    padding: '12px 16px',
    borderTop: '1px solid #E5E5EA',
    background: 'white'
  },
  inputContainer: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
    background: '#F2F2F7',
    borderRadius: '20px',
    padding: '4px 4px 4px 16px'
  },
  textarea: {
    flex: 1,
    border: 'none',
    background: 'transparent',
    fontSize: '16px',
    lineHeight: 1.4,
    resize: 'none',
    outline: 'none',
    padding: '8px 0',
    fontFamily: 'inherit'
  },
  button: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: 'none',
    background: '#007AFF',
    color: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  }
}
