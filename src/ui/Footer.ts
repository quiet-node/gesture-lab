import { TrustBadge } from './TrustBadge';

/**
 * Footer Component
 * Premium sticky footer with logo shimmer effect and creator attribution.
 * Adapted from Tally Aura design for Gesture Lab.
 *
 * @module ui/Footer
 */

/**
 * Configuration for the Footer component
 */
interface FooterConfig {
  /** Profile picture URL */
  profilePicUrl: string;
  /** Creator's X/Twitter handle */
  creatorHandle: string;
  /** Creator's display name */
  creatorName: string;
  /** App name for logo */
  appName: string;
  /** Repository URL */
  repoUrl: string;
}

const DEFAULT_CONFIG: FooterConfig = {
  profilePicUrl: '/creator_profile_picture.png',
  creatorHandle: 'quiet_node',
  creatorName: 'Logan',
  appName: 'Gesture Lab',
  repoUrl: 'https://github.com/quiet-node/mediapipe-for-fun',
};

/**
 * Premium Footer with shimmer effect and staggered animations.
 * Follows Single Responsibility Principle - handles only footer rendering.
 */
export class Footer {
  private container: HTMLElement;
  private element: HTMLElement | null = null;
  private config: FooterConfig;
  private isVisible: boolean = false;
  private trustBadge: TrustBadge | null = null;
  private onClickHandler: (() => void) | null = null;

  constructor(container: HTMLElement, config: Partial<FooterConfig> = {}) {
    this.container = container;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a click handler for the logo (home button)
   */
  onClick(callback: () => void): void {
    this.onClickHandler = callback;
  }

  /**
   * Show the footer with entrance animations
   */
  show(): void {
    if (this.isVisible) return;

    this.element = this.createFooterElement();
    this.container.appendChild(this.element);
    this.isVisible = true;

    // Initialize TrustBadge
    const privacyContainer = this.element.querySelector(
      '.footer-privacy-container',
    );
    if (privacyContainer instanceof HTMLElement) {
      this.trustBadge = new TrustBadge(privacyContainer);
      this.trustBadge.render();
    }

    // Trigger initial shimmer animation after a short delay
    this.triggerInitialShimmer();
  }

  /**
   * Hide and remove the footer
   */
  hide(): void {
    if (!this.isVisible || !this.element) return;

    // Cleanup TrustBadge
    if (this.trustBadge) {
      this.trustBadge.destroy();
      this.trustBadge = null;
    }

    this.element.style.opacity = '0';
    this.element.style.transform = 'translateY(10px)';

    setTimeout(() => {
      if (this.element?.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      this.element = null;
      this.isVisible = false;
    }, 300);
  }

  /**
   * Check if footer is currently visible
   */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Create the footer DOM element
   */
  private createFooterElement(): HTMLElement {
    const currentYear = new Date().getFullYear();
    const footer = document.createElement('footer');
    footer.className = 'app-footer-premium';

    footer.innerHTML = `
      <div class="footer-inner">
        <!-- Left: Logo + Year -->
        <div class="footer-left">
          <div class="logo-shimmer-container footer-logo">
            <span>${this.config.appName}</span>
            <span class="logo-shimmer"></span>
            <span class="logo-shimmer logo-shimmer-initial"></span>
          </div>
          
          <div class="footer-divider"></div>

          <a
            href="${this.config.repoUrl}"
            target="_blank"
            rel="noopener noreferrer"
            class="footer-repo-link"
          >
            <span class="footer-repo-text">Source</span>
            <div class="footer-icon-circle">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" class="footer-icon-svg">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </div>
          </a>

          <div class="footer-divider"></div>
          
          <span class="footer-year">© ${currentYear}</span>
        </div>

        <!-- Center: Creator Attribution -->
        <div class="footer-center">
          <div class="footer-attribution-wrapper">
            <a
              href="https://x.com/${this.config.creatorHandle}"
              target="_blank"
              rel="noopener noreferrer"
              class="footer-attribution"
            >
              <span class="footer-attribution-text">Vibed by ${this.config.creatorName}</span>
              <img
                src="${this.config.profilePicUrl}"
                alt="${this.config.creatorName}"
                class="footer-profile-pic"
                loading="lazy"
              />
            </a>
            
            <div class="footer-attribution-panel">
              <span class="panel-message">Report or suggest new modes to Logan</span>
              <div class="panel-arrow"></div>
            </div>
          </div>
        </div>

        <!-- Right: Privacy Indicator -->
        <div class="footer-right">
          <!-- TrustBadge will be mounted here -->
          <div class="footer-privacy-container"></div>
        </div>
      </div>
    `;

    // Add click listener to logo
    const logo = footer.querySelector('.footer-logo');
    if (logo) {
      logo.addEventListener('click', () => {
        if (this.onClickHandler) this.onClickHandler();
      });
      (logo as HTMLElement).style.cursor = 'pointer';
    }

    return footer;
  }

  /**
   * Trigger the one-time initial shimmer animation on the logo
   */
  private triggerInitialShimmer(): void {
    if (!this.element) return;

    const initialShimmer = this.element.querySelector('.logo-shimmer-initial');
    if (initialShimmer) {
      // Delay to ensure the entrance animation (fade/slide) is mostly complete
      // before triggering the shimmer sweep for maximum visual impact.
      setTimeout(() => {
        initialShimmer.classList.add('active');
      }, 500);
    }
  }
}
