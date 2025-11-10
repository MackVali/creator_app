"use client";
import React from "react";

const CHUNK_RELOAD_FLAG = "app:chunk-reload-attempted";

function isChunkLoadError(error: Error) {
  const message = error?.message ?? "";
  return (
    error?.name === "ChunkLoadError" ||
    /Loading chunk [\w/()-]+ failed/i.test(message) ||
    /ChunkLoadError/i.test(message)
  );
}

interface ErrorBoundaryState {
  err: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { err: null };
  }

  componentDidMount() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
    }
  }

  componentDidCatch(error: Error) {
    if (typeof window !== "undefined" && isChunkLoadError(error)) {
      const hasReloaded = window.sessionStorage.getItem(CHUNK_RELOAD_FLAG);
      if (!hasReloaded) {
        window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, Date.now().toString());
        window.location.reload();
        return;
      }
    }
    this.setState({ err: error });
  }

  render() {
    if (this.state.err)
      return (
        <pre
          style={{
            padding: 16,
            color: "#fca5a5",
            background: "#1a1a1a",
            border: "1px solid #7f1d1d",
          borderRadius: 12,
          whiteSpace: "pre-wrap",
        }}
      >
          <strong style={{ display: "block", marginBottom: 8 }}>
            Oops, something went wrong.
          </strong>
          <span style={{ display: "block", marginBottom: 8 }}>
            {String(this.state.err?.message || this.state.err)}
          </span>
          <span style={{ color: "#f87171" }}>
            Try reloading the page. If the problem persists, clear your browser
            cache and try again.
          </span>
        </pre>
      );
    return this.props.children;
  }
}
