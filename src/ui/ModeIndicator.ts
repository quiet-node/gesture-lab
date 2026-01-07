/**
 * ModeIndicator Component
 * Displays current mode and switching shortcut
 */

export class ModeIndicator {
  private container: HTMLElement;
  private element: HTMLElement | null = null;
  private clickHandler: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  onClick(handler: () => void): void {
    this.clickHandler = handler;
    if (this.element) {
      this.element.style.cursor = 'pointer';
    }
  }

  update(mode: 'galaxy' | 'foggy-mirror' | 'cosmic-slash' | 'hologram'): void {
    if (!this.element) {
      this.createDOM();
    }

    if (!this.element) return;

    const content = this.element.querySelector('.mode-content');
    if (!content) return;

    const modeName =
      mode === 'galaxy'
        ? 'Interactive Galaxy'
        : mode === 'cosmic-slash'
        ? 'Cosmic Slash'
        : mode === 'hologram'
        ? 'Iron Man Hologram'
        : 'Foggy Mirror';

    content.innerHTML = `
      <div class="current-mode">${modeName}</div>
      <div class="switch-hint desktop-hint">Press <kbd>M</kbd> for Main Menu</div>
      <div class="switch-hint mobile-hint">Tap for Main Menu</div>
    `;
  }

  private createDOM(): void {
    this.element = document.createElement('div');
    this.element.className = 'mode-indicator';
    this.element.innerHTML = `
      <div class="mode-content"></div>
    `;

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
      .mode-indicator {
        position: absolute;
        top: 20px;
        left: 20px;
        padding: 10px 12px;
        background: rgba(20, 20, 25, 0.6);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: #fff;
        font-family: 'Nunito', sans-serif;
        border-radius: 16px;
        z-index: 100;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.08);
        min-width: 160px;
        transition: transform 0.2s ease, background 0.2s ease;
      }

      .mode-indicator:active {
        transform: scale(0.98);
        background: rgba(30, 30, 35, 0.8);
      }

      @media (max-width: 768px) {
        .mode-indicator {
          top: 10px;
          left: 10px;
          padding: 8px 12px;
          min-width: 0;
        }
        .current-mode { font-size: 0.85rem; margin-bottom: 0; }
        .desktop-hint { display: none !important; }
        .mobile-hint { display: flex !important; }
      }

      .current-mode {
        font-family: 'Playfair Display', serif;
        font-size: 0.95rem;
        font-weight: 700;
        color: #fff;
        margin-bottom: 4px;
        letter-spacing: 0.02em;
      }

      .switch-hint {
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.5);
        padding-top: 4px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .mobile-hint {
        display: none;
      }

      .switch-hint kbd {
        display: inline-block;
        padding: 2px 6px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        font-family: 'Nunito', sans-serif;
        font-weight: 700;
        font-size: 0.75rem;
        color: #fff;
        min-width: 18px;
        text-align: center;
      }
    `;
    this.element.appendChild(style);
    this.container.appendChild(this.element);
  }
}
