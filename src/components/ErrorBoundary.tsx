import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches render-time crashes so one bad subtree does not blank the whole app.
 *
 * NOTE: this cannot catch everything. Errors thrown while a module is being
 * evaluated — notably validateStories in lib/stories.ts — happen before any
 * boundary mounts, and errors inside event handlers or async callbacks never
 * reach a boundary at all. Those are handled at their own sites; this is not a
 * substitute for either.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { message: string | null }
> {
  state: { message: string | null } = { message: null };

  static getDerivedStateFromError(error: unknown): { message: string } {
    return {
      message: error instanceof Error ? error.message : "Unexpected error",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Marvel Nexus render error", error, info.componentStack);
  }

  render() {
    if (this.state.message === null) return this.props.children;
    return (
      <div className="nexus-error" role="alert">
        <p><b>{this.props.label ?? "Something broke here."}</b></p>
        <p>{this.state.message}</p>
        <button onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}
