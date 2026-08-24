import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** Rendered instead of the default panel — used for per-card fallbacks. */
  fallback?: ReactNode
  /** Identifies which boundary caught it in the console. */
  label?: string
}

type State = { error: Error | null }

/**
 * Stops one bad render from blanking the whole app.
 *
 * React unmounts the entire tree when a render throws and nothing catches it,
 * which is why a single product with a null category produced a white page
 * rather than one broken card. Error boundaries have to be class components —
 * there is no hook equivalent for componentDidCatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the component stack: it names the component that threw, which the
    // message alone does not.
    console.error(`[ErrorBoundary${this.props.label ? ' ' + this.props.label : ''}]`, error)
    console.error(info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback !== undefined) return this.props.fallback

    return (
      <div className="mx-auto flex max-w-measure flex-col items-start gap-4 px-gutter py-section">
        <h1 className="text-h3">Une erreur est survenue</h1>
        <p className="text-body text-ink-soft">
          Cette page n’a pas pu s’afficher. Le détail est dans la console du navigateur.
        </p>
        <pre className="w-full overflow-x-auto rounded-md border border-line bg-field p-3 text-xs text-ink-soft">
          {error.message}
        </pre>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-pill border border-green px-5 py-2.5 text-meta font-semibold text-green"
          >
            Réessayer
          </button>
          <a
            href="/"
            className="rounded-pill border border-green bg-green px-5 py-2.5 text-meta font-semibold text-cream"
          >
            Retour à la boutique
          </a>
        </div>
      </div>
    )
  }
}
