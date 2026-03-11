import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ background: "#0A0A0A", color: "#E0E0D8", fontFamily: "monospace", padding: 30, minHeight: "100vh" }}>
          <div style={{ color: "#F0B845", fontSize: 14, marginBottom: 10 }}>ERROR AL CARGAR</div>
          <pre style={{ color: "#E05555", fontSize: 12, whiteSpace: "pre-wrap" }}>
            {this.state.error?.toString()}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
