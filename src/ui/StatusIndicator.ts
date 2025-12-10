/**
 * StatusIndicator Component
 * Displays application status (loading, ready, error, active)
 */

export class StatusIndicator {
  private container: HTMLElement;
  private element: HTMLElement | null = null;
  private clickHandler: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.createDOM();
  }

  onClick(handler: () => void): void {
    this.clickHandler = handler;
    if (this.element) {
      this.element.style.cursor = 'pointer';
    }
  }

  update(
    message: string,
    state: 'loading' | 'ready' | 'error' | 'active'
  ): void {
    if (!this.element) return;

    const stateColors: Record<string, string> = {
      loading: '#ffeb3b',
      ready: '#4caf50',
      error: '#f44336',
      active: '#2196f3',
    };

    // Use a cleaner DOM structure without the style tag inside innerHTML if possible,
    // but for simplicity and consistency with other components, we'll keep the structure simple.
    // The main styles are in the style block in createDOM.

    // We need to ensure the content is wrapped correctly
    const contentHtml = `
      <span style="
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: ${stateColors[state]};
        box-shadow: 0 0 8px ${stateColors[state]};
      "></span>
      <span style="letter-spacing: 0.02em;">${message}</span>
      <span class="debug-hint" style="margin-left: 4px; opacity: 0.5; font-size: 0.7em;">[D]</span>
    `;

    // We need to preserve the style element, so we only update the content div
    const contentDiv = this.element.querySelector('.status-content');
    if (contentDiv) {
      contentDiv.innerHTML = contentHtml;
    }

    this.element.style.display = 'flex';
  }

  hide(): void {
    if (this.element) {
      this.element.style.display = 'none';
    }
  }

  show(): void {
    if (this.element) {
      this.element.style.display = 'flex';
    }
  }

  private createDOM(): void {
    this.element = document.createElement('div');
    this.element.className = 'status-indicator';
    this.element.innerHTML =
      '<div class="status-content" style="display: flex; align-items: center; gap: 8px;"></div>';

    if (this.clickHandler) {
      this.element.style.cursor = 'pointer';
    }

    this.element.addEventListener('click', () => {
      if (this.clickHandler) {
        this.clickHandler();
      }
    });

    const style = document.createElement('style');
    style.textContent = `
      .status-indicator {
        position: absolute;
        bottom: 30px; /* Aligned with footer on desktop */
        left: 20px;
        padding: 8px 10px; /* Reduced horizontal padding */
        background: rgba(20, 20, 25, 0.6);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: white;
        font-family: 'Nunito', sans-serif;
        font-size: 0.8rem;
        border-radius: 16px;
        z-index: 100;
        display: none;
        align-items: center;
        gap: 8px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.08);
        transition: all 0.3s ease;
      }

      .status-indicator:active {
        transform: scale(0.95);
        background: rgba(30, 30, 35, 0.8);
      }

      @media (max-width: 768px) {
        .status-indicator {
          bottom: 50px; /* Higher than footer on mobile */
          left: 10px;
          padding: 6px 10px;
          font-size: 0.75rem;
        }
        .debug-hint { display: none !important; }
      }
    `;

    this.element.appendChild(style);
    this.container.appendChild(this.element);
  }
}
