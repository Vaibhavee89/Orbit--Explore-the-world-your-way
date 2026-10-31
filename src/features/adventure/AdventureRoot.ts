import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('orbit-adventure-root')
export class AdventureRoot extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      width: 100vw;
      background: #0a0a1a;
      color: #e0e0ff;
      font-family: 'Google Sans Text', sans-serif;
      box-sizing: border-box;
    }

    .badge {
      font-size: 0.75rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #7c7cff;
      margin-bottom: 0.75rem;
    }

    h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin: 0 0 0.5rem;
      background: linear-gradient(135deg, #a78bfa, #38bdf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    p {
      font-size: 1rem;
      color: #9090bb;
      margin: 0 0 2rem;
    }

    .switch-link {
      font-size: 0.875rem;
      color: #7c7cff;
      text-decoration: none;
      border: 1px solid #7c7cff44;
      padding: 0.5rem 1.25rem;
      border-radius: 999px;
      transition: background 0.2s;
    }

    .switch-link:hover {
      background: #7c7cff22;
    }
  `;

  render() {
    return html`
      <div class="badge">Adventure Mode — coming soon</div>
      <h1>Orbit Adventure</h1>
      <p>Real-world exploration game — under construction.</p>
      <a class="switch-link" href="/">← Back to Travel Mode</a>
    `;
  }
}
