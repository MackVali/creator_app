"use client";
import React from "react";
export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { err: any }
> {
  constructor(p: any) {
    super(p);
    this.state = { err: null };
  }
  componentDidCatch(error: any) {
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
          {String(this.state.err?.message || this.state.err)}
        </pre>
      );
    return this.props.children;
  }
}
