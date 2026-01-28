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

  update(
    mode:
      | 'galaxy'
      | 'foggy-mirror'
      | 'cosmic-slash'
      | 'iron-man-workshop'
      | 'stellar-wave'
      | 'light-bulb'
  ): void {
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
          : mode === 'iron-man-workshop'
            ? 'Iron Man Workshop'
            : mode === 'stellar-wave'
              ? 'Stellar Wave'
              : mode === 'light-bulb'
                ? 'Light Bulb'
                : 'Foggy Mirror';

    content.innerHTML = `
      <div class="current-mode">${modeName}</div>
      <div class="switch-hint desktop-hint">Press <kbd>M</kbd> for Main Menu</div>
      <div class="switch-hint mobile-hint">Tap for Main Menu</div>
    `;
  }

  private createDOM(): void {
    this.element = document.createElement('div');
    this.element.className = 'mode-indicator-layout';
    this.element.innerHTML = `
      <div class="mode-indicator-inner">
        <div class="mode-indicator-box">
          <div class="mode-content"></div>
        </div>
      </div>
    `;

    const indicatorBox = this.element.querySelector('.mode-indicator-box') as HTMLElement;

    if (this.clickHandler) {
      indicatorBox.style.cursor = 'pointer';
    }

    indicatorBox.addEventListener('click', () => {
      if (this.clickHandler) {
        this.clickHandler();
      }
    });

    const style = document.createElement('style');
    style.textContent = `
      .mode-indicator-layout {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        padding-top: 20px;
        z-index: 100;
        pointer-events: none;
      }

      .mode-indicator-inner {
        margin: 0 auto;
        padding: 0 16px;
        display: flex;
        justify-content: flex-start;
      }

      /* Apply max-width constraint only above 2000px viewport */
      @media (min-width: 3000px) {
        .mode-indicator-inner {
          max-width: 1920px;
        }
      }

      .mode-indicator-box {
        pointer-events: auto;
        padding: 10px 12px;
        background: rgba(20, 20, 25, 0.6);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: #fff;
        font-family: 'Nunito', sans-serif;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.08);
        min-width: 160px;
        transition: transform 0.2s ease, background 0.2s ease;
      }

      .mode-indicator-box:active {
        transform: scale(0.98);
        background: rgba(30, 30, 35, 0.8);
      }

      @media (max-width: 768px) {
        .mode-indicator-layout {
          padding-top: 10px;
        }
        .mode-indicator-inner {
          padding: 0 10px;
        }
        .mode-indicator-box {
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
