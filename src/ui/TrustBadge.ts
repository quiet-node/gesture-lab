/**
 * TrustBadge Component
 *
 * A Vanilla TypeScript implementation of the Tally Aura Trust Badge.
 * Features a progressive disclosure UI: a minimal shield button that expanding
 * into a detailed privacy promise popover.
 *
 * Design: "Ultra-minimalistic, low-key, and premium" (Glassmorphism).
 *
 * @module ui/TrustBadge
 */

export class TrustBadge {
  private container: HTMLElement;
  private wrapper: HTMLElement | null = null;
  private popover: HTMLElement | null = null;
  private isOpen: boolean = false;
  private outsideClickHandler: (e: MouseEvent) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.outsideClickHandler = this.handleOutsideClick.bind(this);
  }

  /**
   * Render the component into the container
   */
  render(): void {
    // Prevent double rendering
    if (this.wrapper) return;

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'trust-badge-wrapper';
    this.wrapper.style.position = 'relative';

    // 1. Create Trigger Button
    const button = document.createElement('button');
    button.className = 'trust-badge';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-haspopup', 'dialog');
    button.innerHTML = `
      ${this.getShieldIcon('trust-badge__icon')}
      <span class="trust-badge__label">Privacy: On-Device</span>
    `;

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // 2. Create Popover
    this.popover = document.createElement('div');
    this.popover.className = 'trust-badge__popover';
    this.popover.innerHTML = this.getPopoverContent();

    // Assemble
    this.wrapper.appendChild(button);
    this.wrapper.appendChild(this.popover);
    this.container.appendChild(this.wrapper);
  }

  /**
   * Toggle the popover visibility state
   */
  private toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Open the popover
   */
  private open(): void {
    if (!this.popover || this.isOpen) return;

    this.isOpen = true;
    this.popover.classList.add('is-open');
    this.wrapper
      ?.querySelector('.trust-badge')
      ?.setAttribute('aria-expanded', 'true');

    // Add global click listener to close on click-outside
    // Slight delay to prevent immediate closing if the trigger click bubbles
    setTimeout(() => {
      document.addEventListener('click', this.outsideClickHandler);
    }, 0);
  }

  /**
   * Close the popover
   */
  private close(): void {
    if (!this.popover || !this.isOpen) return;

    this.isOpen = false;
    this.popover.classList.remove('is-open');
    this.wrapper
      ?.querySelector('.trust-badge')
      ?.setAttribute('aria-expanded', 'false');

    document.removeEventListener('click', this.outsideClickHandler);
  }

  /**
   * Handle clicks outside the component
   */
  private handleOutsideClick(e: MouseEvent): void {
    const target = e.target as Node;
    if (this.popover && !this.popover.contains(target)) {
      this.close();
    }
  }

  /**
   * Clean up event listeners and DOM
   */
  destroy(): void {
    document.removeEventListener('click', this.outsideClickHandler);
    if (this.wrapper && this.wrapper.parentNode) {
      this.wrapper.parentNode.removeChild(this.wrapper);
    }
    this.wrapper = null;
    this.popover = null;
  }

  /**
   * SVG Helper: Shield Icon
   */
  private getShieldIcon(className: string): string {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}">
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    `;
  }

  /**
   * SVG Helper: Check Icon
   */
  private getCheckIcon(className: string): string {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    `;
  }

  /**
   * Logic: DOM String Construction for Popover
   */
  private getPopoverContent(): string {
    const trusts = [
      {
        title: 'No Server Upload',
        desc: 'Video frames are processed locally. Nothing leaves your device.',
      },
      {
        title: 'Ephemeral Data',
        desc: 'We do not record your movements. Data vanishes instantly.',
      },
      {
        title: 'Open Source',
        desc: 'Code is public. You can verify our privacy claims.',
      },
    ];

    return `
      <div class="trust-badge__header">
        <div class="trust-badge__header-icon-box">
          ${this.getShieldIcon('trust-badge__header-icon')}
        </div>
        <span class="trust-badge__header-title">Verified Privacy Scope</span>
      </div>

      <div class="trust-badge__content">
        ${trusts
          .map(
            (item) => `
          <div class="trust-item">
            <div class="trust-item__icon-box">
              ${this.getCheckIcon('trust-item__icon')}
            </div>
            <div class="trust-item__text-col">
              <span class="trust-item__title">${item.title}</span>
              <span class="trust-item__desc">${item.desc}</span>
            </div>
          </div>
        `,
          )
          .join('')}
      </div>

      <div class="trust-badge__footer">
        <a 
          href="https://github.com/quiet-node/gesture-lab" 
          target="_blank" 
          rel="noopener noreferrer"
          class="trust-badge__footer-link"
        >
          View Source Code • Trusted
        </a>
      </div>
    `;
  }
}
