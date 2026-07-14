import {
  useEffect,
  useMemo,
  useRef,
  type ClipboardEvent,
  type ComponentProps,
  type ReactElement
} from 'react'
import CodeEditor from '@uiw/react-textarea-code-editor'
import rehypePrism from 'rehype-prism-plus'
import '@uiw/react-textarea-code-editor/dist.css'

export interface JsonEditorError {
  message: string
  line: number | null
  column: number | null
}

interface JsonCodeEditorProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error: JsonEditorError | null
  helperText?: string
  placeholder?: string
  minHeight?: number
  onFormat?: () => void
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void
}

const JSON_EDITOR_REHYPE_PLUGINS: NonNullable<ComponentProps<typeof CodeEditor>['rehypePlugins']> = [
  [rehypePrism, { ignoreMissing: true, showLineNumbers: true }]
]

export default function JsonCodeEditor({
  id,
  label,
  value,
  onChange,
  error,
  helperText,
  placeholder,
  minHeight = 180,
  onFormat,
  onPaste
}: JsonCodeEditorProps): ReactElement {
  const editorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!editorRef.current) {
      return
    }

    const existing = editorRef.current.querySelectorAll('.json-code-line-error')
    existing.forEach((element) => element.classList.remove('json-code-line-error'))

    if (error?.line == null) {
      return
    }

    const line = editorRef.current.querySelector(`.code-line[line="${error.line}"]`)
    line?.classList.add('json-code-line-error')
  }, [error?.line, value])

  const errorSummary = useMemo(() => {
    if (!error) {
      return null
    }

    if (error.line == null) {
      return error.message
    }

    const location = error.column == null
      ? `Line ${error.line}`
      : `Line ${error.line}, Col ${error.column}`

    return `${location}: ${error.message}`
  }, [error])

  const canFormat = typeof onFormat === 'function' && value.trim().length > 0 && !error

  return (
    <div className="form-group">
      <div className="json-code-editor-header">
        <label className="form-label" htmlFor={id}>{label}</label>
        {onFormat && (
          <button
            type="button"
            className={`btn btn-sm ${canFormat ? 'btn-secondary' : 'btn-secondary'}`}
            disabled={!canFormat}
            onClick={onFormat}
          >
            Format JSON
          </button>
        )}
      </div>

      <div
        ref={editorRef}
        className={`json-code-editor-shell${error ? ' is-invalid' : ''}`}
      >
        <CodeEditor
          id={id}
          value={value}
          language="json"
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onPaste={onPaste}
          padding={14}
          minHeight={minHeight}
          rehypePlugins={JSON_EDITOR_REHYPE_PLUGINS}
          data-color-mode="dark"
          className="json-code-editor"
          style={{
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 13,
            backgroundColor: 'var(--bg-void)'
          }}
        />
      </div>

      {errorSummary ? (
        <p className="json-code-editor-error">{errorSummary}</p>
      ) : helperText ? (
        <p className="json-code-editor-help">{helperText}</p>
      ) : null}
    </div>
  )
}
