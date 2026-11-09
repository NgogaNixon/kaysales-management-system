import { Component } from 'react'

// Catches a crash in any page and shows a friendly screen instead of a black page
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    const language = localStorage.getItem('kaysales_lang') || 'en'
    const french = language === 'fr'
    const message = String(this.state.error?.message || this.state.error)

    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="bg-surface-elevated border border-red-800 rounded-2xl p-8 w-full max-w-md text-center">
          <h2 className="text-2xl font-bold text-white mb-2">
            {french ? 'Une erreur est survenue' : 'Something went wrong'}
          </h2>
          <p className="text-gray-400 mb-4">
            {french
              ? 'Cette page a rencontré un problème. Rechargez la page. Si cela continue, envoyez-nous le message ci-dessous.'
              : 'This page ran into a problem. Reload the page. If it keeps happening, send us the message below.'}
          </p>
          <p className="text-red-300 text-xs bg-red-950 border border-red-900 rounded-lg p-3 mb-6 break-words text-left">
            {message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition"
          >
            {french ? 'Recharger la page' : 'Reload the page'}
          </button>
        </div>
      </div>
    )
  }
}
