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

  update(mode: 'galaxy' | 'foggy-mirror' | 'cosmic-slash' | 'hologram'): void {
    if (!this.element) {
      this.createDOM();
    }

    if (!this.element) return;

    const content = this.element.querySelector('.hint-content');
    if (!content) return;

    if (mode === 'galaxy') {
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
    } else if (mode === 'hologram') {
      content.innerHTML = `
        <div class="hint-header">
          <span class="hint-title">Guide</span>
        </div>
        <div class="hint-list">
          <div class="hint-item">Grab body to rotate</div>
          <div class="hint-item">Grab arms/legs to pose</div>
          <div class="hint-item">Press <kbd>R</kbd> to reset</div>
        </div>
      `;
    } else {
      content.innerHTML = `
        <div class="hint-header">
          <span class="hint-title">Guide</span>
        </div>
        <div class="hint-list">
          <div class="hint-item">Wave your hand to wipe away the fog</div>
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
      if (this.isVisible) {
        this.element.classList.remove('minimized');
      } else {
        this.element.classList.add('minimized');
      }
    }
  }

  private createDOM(): void {
    this.element = document.createElement('div');
    this.element.className = 'hint-component';
    this.element.innerHTML = `
      <div class="hint-content"></div>
      <div class="hint-footer">
        <span class="desktop-text">Press <kbd>H</kbd> to toggle hints</span>
        <span class="mobile-text">Tap to toggle hints</span>
      </div>
      <div class="hint-minimized-icon">H</div>
    `;

    this.element.addEventListener('click', (e) => {
      // If minimized, clicking anywhere expands it
      if (!this.isVisible) {
        this.toggle();
        e.stopPropagation();
      }
    });

    const footer = this.element.querySelector('.hint-footer');
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
      .hint-component {
        position: absolute;
        bottom: 30px; /* Aligned with footer on desktop */
        right: 20px;
        padding: 16px 12px;
        background: rgba(20, 20, 25, 0.6);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: #fff;
        font-family: 'Nunito', sans-serif;
        border-radius: 16px;
        z-index: 100;
        width: 240px; /* Fixed width for smoother transition */
        max-height: 400px; /* Arbitrary large height */
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.08);
        transition: all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1); /* Slower, smoother bezier */
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .hint-component.minimized {
        width: 40px;
        height: 40px; /* Explicit height */
        max-height: 40px;
        padding: 0;
        border-radius: 50%;
        cursor: pointer;
        background: rgba(20, 20, 25, 0.8);
        align-items: center;
        justify-content: center;
      }

      .hint-content, .hint-footer {
        opacity: 1;
        transition: opacity 0.4s ease 0.2s; /* Slower fade in with longer delay */
        width: 100%;
      }

      .hint-component.minimized .hint-content,
      .hint-component.minimized .hint-footer {
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease; /* Faster fade out */
        position: absolute; /* Take out of flow to prevent layout issues */
      }

      .hint-minimized-icon {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.8);
        font-family: 'Playfair Display', serif;
        font-size: 1.2rem;
        font-weight: 700;
        color: #fff;
        opacity: 0;
        transition: all 0.3s ease;
        pointer-events: none;
      }

      .hint-component.minimized .hint-minimized-icon {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s; /* Pop in with delay */
      }

      .hint-footer {
        margin-top: auto; /* Push to bottom */
        padding-top: 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.5);
        text-align: center;
        cursor: pointer;
      }
      
      .hint-footer:hover {
        color: rgba(255, 255, 255, 0.8);
      }

      .clickable-hint {
        cursor: pointer;
        transition: background 0.2s;
        border-radius: 4px;
        padding: 2px 4px;
        margin: -2px -4px;
      }
      
      .clickable-hint:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      
      .clickable-hint:active {
        background: rgba(255, 255, 255, 0.2);
      }

      .mobile-text { display: none; }

      @media (max-width: 768px) {
        .hint-component {
          bottom: 50px; /* Higher than footer on mobile */
          right: 10px;
          left: auto; /* Don't force left: 10px, let width handle it */
          width: 200px; /* Slightly smaller on mobile */
        }
        
        .hint-component.minimized {
          width: 40px;
          left: auto;
        }
        
        .desktop-text { display: none !important; }
        .mobile-text { display: inline !important; }
      }
        max-width: 260px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @media (max-width: 768px) {
        .hint-component {
          bottom: 60px; /* Above footer/status */
          right: 10px;
          left: 10px;
          width: auto;
          max-width: none;
          min-width: 0;
          padding: 12px;
        }
        .hint-title { font-size: 0.9rem; }
        .hint-item { font-size: 0.8rem; }
      }

      .hint-header {
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .hint-title {
        font-family: 'Playfair Display', serif;
        font-size: 1rem;
        font-weight: 700;
        color: #fff;
        letter-spacing: 0.02em;
      }

      .hint-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .hint-item {
        font-size: 0.85rem;
        color: rgba(255, 255, 255, 0.7);
        font-weight: 400;
        line-height: 1.4;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .hint-item::before {
        content: '';
        display: block;
        width: 4px;
        height: 4px;
        background: rgba(255, 255, 255, 0.3);
        border-radius: 50%;
      }

      .hint-item.highlight {
        color: #fff;
        margin-top: 4px;
      }

      .hint-item.highlight::before {
        background: #fff;
      }

      .hint-footer {
        margin-top: 20px;
        padding-top: 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.4);
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      kbd {
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
        margin: 0 2px;
      }
    `;
    this.element.appendChild(style);
    this.container.appendChild(this.element);
  }
}
