import { useEffect, useRef, type ReactElement } from 'react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  alternateLabel?: string
  alternateClassName?: string
  checkboxLabel?: string
  checkboxChecked?: boolean
  onCheckboxChange?: (checked: boolean) => void
  onConfirm: () => void
  onCancel: () => void
  onAlternate?: () => void
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  alternateLabel,
  alternateClassName = 'btn btn-secondary',
  checkboxLabel,
  checkboxChecked = false,
  onCheckboxChange,
  onConfirm,
  onCancel,
  onAlternate
}: ConfirmDialogProps): ReactElement | null {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    cancelButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <h3>{title}</h3>
        <p style={{ color: 'var(--text-steel)', lineHeight: '1.6' }}>{message}</p>
        {checkboxLabel && onCheckboxChange && (
          <label className="checkbox-container modal-option">
            {checkboxLabel}
            <input
              type="checkbox"
              checked={checkboxChecked}
              onChange={(event) => onCheckboxChange(event.target.checked)}
            />
            <span className="checkmark" aria-hidden="true" />
          </label>
        )}
        <div className="modal-actions">
          <button ref={cancelButtonRef} type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          {alternateLabel && onAlternate && (
            <button type="button" className={alternateClassName} onClick={onAlternate}>
              {alternateLabel}
            </button>
          )}
          <button type="button" className="btn btn-orange" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
