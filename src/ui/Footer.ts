/**
 * Footer Component
 * Displays the "built by" credit
 */

export class Footer {
  private container: HTMLElement;
  private element: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  show(): void {
    if (this.element) return;

    this.element = document.createElement('div');
    this.element.className = 'app-footer';
    this.element.innerHTML = `
      <a href="https://x.com/quiet_node" target="_blank" rel="noopener noreferrer">
        built by @quiet_node
      </a>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .app-footer {
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2000;
        font-family: 'Nunito', sans-serif;
        font-size: 0.85rem;
        opacity: 0.7;
        transition: all 0.3s ease;
        pointer-events: auto;
      }

      .app-footer:hover {
        opacity: 1;
        transform: translateX(-50%) translateY(-2px);
      }

      .app-footer a {
        color: rgba(255, 255, 255, 0.8);
        text-decoration: none;
        padding: 8px 12px;
        background: rgba(20, 20, 25, 0.6);
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        transition: all 0.3s ease;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        letter-spacing: 0.05em;
      }

      @media (max-width: 768px) {
        .app-footer {
          bottom: 20px;
          width: 100%;
          text-align: center;
        }
        .app-footer a {
          padding: 6px 10px;
          font-size: 0.75rem;
        }
      }

      .app-footer a:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
        color: #fff;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
      }
    `;
    this.element.appendChild(style);

    this.container.appendChild(this.element);
  }

  hide(): void {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
      this.element = null;
    }
  }
}
