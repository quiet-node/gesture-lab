/**
 * HintComponent
 * Displays control hints for the current mode
 */

export class HintComponent {
  private container: HTMLElement;
  private element: HTMLElement | null = null;
  private isVisible: boolean = true;
  private actionHandler: ((action: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  onAction(handler: (action: string) => void): void {
    this.actionHandler = handler;
  }

  update(
    mode:
      | 'galaxy'
      | 'foggy-mirror'
      | 'cosmic-slash'
      | 'iron-man-workshop'
      | 'stellar-wave'
      | 'light-bulb'
      | 'magnetic-clutter'
  ): void {
    if (!this.element) {
      this.createDOM();
    }

    if (!this.element) return;

    const content = this.element.querySelector('.hint-content');
    if (!content) return;

    if (mode === 'iron-man-workshop') {
      content.innerHTML = `
        <div class="hint-header">
          <span class="hint-title">Guide</span>
        </div>
        <div class="hint-list">
          <div class="hint-item">Open left hand to disassemble</div>
          <div class="hint-item">Close left hand to assemble</div>
          <div class="hint-item">Pinch right hand to rotate</div>
          <div class="hint-item">Hover right index for part info</div>
          <div class="hint-item">Press <kbd>R</kbd> to reset</div>
        </div>
      `;
    } else if (mode === 'cosmic-slash') {
      content.innerHTML = `
        <div class="hint-header">
          <span class="hint-title">Guide</span>
        </div>
        <div class="hint-list">
          <div class="hint-item">Swipe through objects to score points</div>
          <div class="hint-item">Fast swipes for bigger explosions</div>
          <div class="hint-item">Show both hands for POW beam</div>
          <div class="hint-item">Press <kbd>Space</kbd> to pause/resume</div>
          <div class="hint-item">Press <kbd>R</kbd> to restart</div>
        </div>
      `;
    } else if (mode === 'galaxy') {
      content.innerHTML = `
        <div class="hint-header">
          <span class="hint-title">Guide</span>
        </div>
        <div class="hint-list">
          <div class="hint-item">Show both hands to spawn</div>
          <div class="hint-item">Move apart to grow</div>
          <div class="hint-item">Move together to shrink</div>
          <div class="hint-item">Close hands for Big Bang</div>
          <div class="hint-item">Pinch for Star burst</div>
        </div>
      `;
    } else if (mode === 'stellar-wave') {
      content.innerHTML = `
        <div class="hint-header">
          <span class="hint-title">Stellar Wave</span>
          <span class="hint-subtitle">Interaction Guide</span>
        </div>
        <div class="hint-grid">
          <div class="hint-row">
            <span class="hint-label">Cosmic Pulse</span>
            <span class="hint-value">Right Index Pinch</span>
          </div>
          <div class="hint-row">
            <span class="hint-label">Force Field</span>
            <span class="hint-value">Left Index Pinch</span>
          </div>
          <div class="hint-row">
            <span class="hint-label">Gravity Well</span>
            <span class="hint-value">Left Middle Pinch</span>
          </div>
          <div class="hint-row">
            <span class="hint-label">Nebula Vortex</span>
            <span class="hint-value">Left Ring Pinch</span>
          </div>
          <div class="hint-row">
            <span class="hint-label">Cosmic Strings</span>
            <span class="hint-value">Left Pinky Pinch</span>
          </div>
          <div class="hint-row">
            <span class="hint-label">Quasar Surge</span>
            <span class="hint-value">Left Fist Hold</span>
          </div>
          <div class="hint-row">
            <span class="hint-label">System Reset</span>
            <span class="hint-value">Press <kbd>R</kbd></span>
          </div>
        </div>
      `;
    } else if (mode === 'light-bulb') {
      content.innerHTML = `
        <div class="hint-header">
          <span class="hint-title">Light Bulb</span>
          <span class="hint-subtitle">Interaction Guide</span>
        </div>
        <div class="hint-grid">
          <div class="hint-row">
            <span class="hint-label">Rotate Bulb</span>
            <span class="hint-value">Pinch + Drag</span>
          </div>
          <div class="hint-row">
            <span class="hint-label">Toggle Light</span>
            <span class="hint-value">Pinch Cord + Pull</span>
          </div>
          <div class="hint-row">
            <span class="hint-label">Reset</span>
            <span class="hint-value">Press <kbd>R</kbd></span>
          </div>
        </div>
        </div>
      `;
    } else if (mode === 'magnetic-clutter') {
      content.innerHTML = `
        <div class="hint-header">
          <span class="hint-title">Magnetic Clutter</span>
          <span class="hint-subtitle">Interaction Guide</span>
        </div>
        <div class="hint-grid">
          <div class="hint-row">
            <span class="hint-label">Repulsor</span>
            <span class="hint-value">Right Fist</span>
          </div>
          <div class="hint-row">
            <span class="hint-label">Grab Ball</span>
            <span class="hint-value">Left Pinch</span>
          </div>
          <div class="hint-row">
            <span class="hint-label">Reset</span>
            <span class="hint-value">Press <kbd>R</kbd></span>
          </div>
        </div>
      `;
    } else {
      content.innerHTML = `
        <div class="hint-header">
          <span class="hint-title">Guide</span>
        </div>
        <div class="hint-list">
          <div class="hint-item">Wave hands to clear the fog</div>
          <div class="hint-item highlight clickable-hint" data-action="reset">
            <span class="desktop-text">Press <kbd>R</kbd> to reset</span>
            <span class="mobile-text">Tap to Reset</span>
          </div>
        </div>
      `;

      // Re-attach listeners for dynamic content
      const clickableHints = content.querySelectorAll('.clickable-hint');
      clickableHints.forEach((hint) => {
        hint.addEventListener('click', (e) => {
          const action = (e.currentTarget as HTMLElement).dataset.action;
          if (action && this.actionHandler) {
            this.actionHandler(action);
          }
        });
      });
    }
  }

  toggle(): void {
    this.isVisible = !this.isVisible;
    this.updateVisibility();
  }

  show(): void {
    this.isVisible = true;
    this.updateVisibility();
  }

  hide(): void {
    this.isVisible = false;
    this.updateVisibility();
  }

  private updateVisibility(): void {
    if (this.element) {
      const hintBox = this.element.querySelector('.hint-component-box');
      if (hintBox) {
        if (this.isVisible) {
          hintBox.classList.remove('minimized');
        } else {
          hintBox.classList.add('minimized');
        }
      }
    }
  }

  private createDOM(): void {
    this.element = document.createElement('div');
    this.element.className = 'hint-component-layout';
    this.element.innerHTML = `
      <div class="hint-component-inner">
        <div class="hint-component-box">
          <div class="hint-content"></div>
          <div class="hint-footer">
            <span class="desktop-text">Press <kbd>H</kbd> to toggle hints</span>
            <span class="mobile-text">Tap to toggle hints</span>
          </div>
          <div class="hint-minimized-icon">H</div>
        </div>
      </div>
    `;

    const hintBox = this.element.querySelector('.hint-component-box') as HTMLElement;

    hintBox.addEventListener('click', (e) => {
      // If minimized, clicking anywhere expands it
      if (!this.isVisible) {
        this.toggle();
        e.stopPropagation();
      }
    });

    const footer = hintBox.querySelector('.hint-footer');
    if (footer) {
      footer.addEventListener('click', (e) => {
        // If expanded, clicking footer minimizes it
        if (this.isVisible) {
          this.toggle();
          e.stopPropagation();
        }
      });
    }

    const style = document.createElement('style');
    style.textContent = `
      .hint-component-layout {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        padding-bottom: 30px;
        z-index: 150;
        pointer-events: none;
      }

      .hint-component-inner {
        margin: 0 auto;
        padding: 0 16px;
        display: flex;
        justify-content: flex-end;
      }

      /* Apply max-width constraint only above 2000px viewport */
      @media (min-width: 3000px) {
        .hint-component-inner {
          max-width: 1920px;
        }
      }

      .hint-component-box {
        pointer-events: auto;
        padding: 24px 12px;
        background: rgba(10, 15, 20, 0.75);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: #fff;
        font-family: 'Nunito', sans-serif;
        border-radius: 4px; /* Sharper corners for tech look */
        width: 270px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 255, 255, 0.15); /* Cyan border glow */
        transition: all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        position: relative;
      }

      /* Corner brackets using pseudo-elements */
      .hint-component-box::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 20px;
        height: 20px;
        border-top: 2px solid rgba(0, 255, 255, 0.6);
        border-left: 2px solid rgba(0, 255, 255, 0.6);
        pointer-events: none;
      }

      .hint-component-box::after {
        content: '';
        position: absolute;
        bottom: 0;
        right: 0;
        width: 20px;
        height: 20px;
        border-bottom: 2px solid rgba(0, 255, 255, 0.6);
        border-right: 2px solid rgba(0, 255, 255, 0.6);
        pointer-events: none;
      }

      .hint-component-box.minimized {
        width: 48px;
        height: 48px;
        max-height: 48px;
        padding: 0;
        border-radius: 50%;
        cursor: pointer;
        background: rgba(10, 15, 20, 0.9);
        border: 1px solid rgba(0, 255, 255, 0.3);
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      }

      .hint-content, .hint-footer {
        opacity: 1;
        transition: opacity 0.4s ease 0.2s;
        width: 100%;
      }

      .hint-component-box.minimized .hint-content,
      .hint-component-box.minimized .hint-footer {
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
        position: absolute;
      }

      .hint-minimized-icon {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.8);
        font-family: 'Playfair Display', serif;
        font-size: 1.2rem;
        font-weight: 700;
        color: rgba(0, 255, 255, 0.9);
        opacity: 0;
        transition: all 0.3s ease;
        pointer-events: none;
      }

      .hint-component-box.minimized .hint-minimized-icon {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s;
      }

      .hint-header {
        margin-bottom: 20px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(0, 255, 255, 0.2);
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .hint-title {
        font-family: 'Playfair Display', serif; /* Keep brand font */
        font-size: 0.9rem;
        font-weight: 700;
        color: #fff;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .hint-subtitle {
        font-size: 0.7rem;
        color: rgba(0, 255, 255, 0.7);
        letter-spacing: 0.05em;
        font-weight: 600;
      }

      /* Grid Layout for Hints */
      .hint-grid {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .hint-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }

      .hint-row:last-child {
        border-bottom: none;
      }

      .hint-label {
        font-size: 0.7rem;
        color: rgba(0, 255, 255, 0.8);
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        flex: 0 0 110px; /* Fixed width for labels */
      }

      .hint-value {
        font-size: 0.85rem;
        color: rgba(255, 255, 255, 0.9);
        font-weight: 400;
        text-align: right;
        flex: 1;
      }

      /* Legacy List Support (for other modes) */
      .hint-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .hint-item {
        font-size: 0.85rem;
        color: rgba(255, 255, 255, 0.8);
        font-weight: 400;
        line-height: 1.4;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .hint-item::before {
        content: '';
        display: block;
        width: 4px;
        height: 4px;
        background: rgba(0, 255, 255, 0.5); /* Cyan dots */
        border-radius: 50%;
      }

      .hint-footer {
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        font-size: 0.7rem;
        color: rgba(255, 255, 255, 0.4);
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }

      kbd {
        display: inline-block;
        padding: 2px 6px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        font-family: 'Nunito', sans-serif;
        font-weight: 700;
        font-size: 0.75rem;
        color: #fff;
        min-width: 18px;
        text-align: center;
        margin: 0 2px;
        box-shadow: 0 2px 0 rgba(0,0,0,0.2);
      }

      .mobile-text {
        display: none;
      }

      .desktop-text {
        display: inline;
      }

      @media (max-width: 768px) {
        .hint-component-layout {
          bottom: 50px;
          padding-bottom: 10px;
        }

        .hint-component-inner {
          padding: 0 10px;
          justify-content: center; /* Center on mobile if full width */
        }

        .hint-component-box {
          width: auto;
          flex: 1;
          max-width: none;
          min-width: 0;
          padding: 16px;
        }

        .hint-label {
          flex: 0 0 90px;
          font-size: 0.65rem;
        }

        .hint-value {
          font-size: 0.8rem;
        }

        .hint-component-box.minimized {
          width: 48px;
          flex: none;
        }
        
        .desktop-text { display: none !important; }
        .mobile-text { display: inline !important; }
      }
    `;
    this.element.appendChild(style);
    this.container.appendChild(this.element);
  }
}
