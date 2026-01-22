/**
 * LandingPage Component
 * Displays the initial mode selection screen
 */

export type InteractionMode =
  | 'galaxy'
  | 'foggy-mirror'
  | 'cosmic-slash'
  | 'iron-man-workshop'
  | 'stellar-wave';

export class LandingPage {
  private container: HTMLElement;
  private element: HTMLElement | null = null;
  private onSelect: (mode: InteractionMode) => void;
  private isVisible: boolean = false;

  constructor(container: HTMLElement, onSelect: (mode: InteractionMode) => void) {
    this.container = container;
    this.onSelect = onSelect;
  }

  /**
   * Show the landing page
   */
  show(): void {
    if (this.isVisible) return;

    this.element = document.createElement('div');
    this.element.className = 'landing-page';
    this.element.innerHTML = `
      <div class="landing-container">
        <header class="landing-header">
          <h1 class="app-title">Gesture Lab</h1>
          <p class="app-subtitle">Touchless Interactive Experiences</p>
        </header>
        
        <div class="portals-container">
          <button class="portal-card workshop-portal" data-mode="iron-man-workshop">
            <div class="portal-content">
              <h2 class="portal-title">Iron Man Workshop</h2>
              <p class="portal-desc">Interactive Mark VI Armor Interface</p>
            </div>
            <div class="portal-footer">
              <span class="key-hint">Press <kbd>I</kbd></span>
            </div>
            <div class="portal-bg"></div>
          </button>

          <button class="portal-card slash-portal" data-mode="cosmic-slash">
            <div class="portal-content">
              <h2 class="portal-title">Cosmic Slash</h2>
              <p class="portal-desc">Slice through cosmic anomalies with your hands</p>
            </div>
            <div class="portal-footer">
              <span class="key-hint">Press <kbd>C</kbd></span>
            </div>
            <div class="portal-bg"></div>
          </button>

          <button class="portal-card galaxy-portal" data-mode="galaxy">
            <div class="portal-content">
              <h2 class="portal-title">Interactive Galaxy</h2>
              <p class="portal-desc">Manipulate a universe of particles</p>
            </div>
            <div class="portal-footer">
              <span class="key-hint">Press <kbd>G</kbd></span>
            </div>
            <div class="portal-bg"></div>
          </button>
          
          <button class="portal-card fog-portal" data-mode="foggy-mirror">
            <div class="portal-content">
              <h2 class="portal-title">Foggy Mirror</h2>
              <p class="portal-desc">Clear the mist to reveal reality</p>
            </div>
            <div class="portal-footer">
              <span class="key-hint">Press <kbd>F</kbd></span>
            </div>
            <div class="portal-bg"></div>
          </button>

          <button class="portal-card stellar-portal" data-mode="stellar-wave">
            <div class="portal-content">
              <h2 class="portal-title">Stellar Wave</h2>
              <p class="portal-desc">Trigger cosmic ripples with your pinch</p>
            </div>
            <div class="portal-footer">
              <span class="key-hint">Press <kbd>S</kbd></span>
            </div>
            <div class="portal-bg"></div>
          </button>
        </div>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.id = 'landing-page-style';
    style.textContent = `
      .landing-page {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #050508;
        background-image: 
          radial-gradient(circle at 50% 0%, rgba(40, 40, 60, 0.2) 0%, transparent 50%),
          radial-gradient(circle at 80% 80%, rgba(30, 30, 40, 0.1) 0%, transparent 40%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.6s ease;
        font-family: 'Nunito', sans-serif !important;
        overflow: hidden;
      }

      .landing-page * {
        font-family: 'Nunito', sans-serif !important;
      }
      
      .landing-page.visible {
        opacity: 1;
      }

      .landing-container {
        text-align: center;
        width: 100%;
        max-width: 600px;
        height: 100%;
        padding: 4rem 2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
      }

      .landing-header {
        animation: fadeDown 0.8s ease-out forwards;
      }

      .app-title {
        font-family: 'Playfair Display', serif !important;
        font-size: 4rem;
        font-weight: 700;
        letter-spacing: 0.1rem;
        margin: 0;
        background: linear-gradient(to bottom, #ffffff, #aaaaaa);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      .app-subtitle {
        font-size: 1.1rem;
        color: #666688;
        margin-top: 0.5rem;
        font-weight: 300;
        letter-spacing: 0.1rem;
        text-transform: uppercase;
      }

      .portals-container {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        width: 100%;
        perspective: 1000px;
        margin: auto 0; /* Center vertically if space allows */
      }

      .portal-card {
        position: relative;
        width: 100%;
        height: auto;
        min-height: 100px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 1.5rem 2rem;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        text-align: left;
        overflow: hidden;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        animation: fadeUp 0.8s ease-out forwards;
        animation-delay: 0.2s;
        opacity: 0;
      }

      .portal-card:nth-child(2) {
        animation-delay: 0.3s;
      }

      .portal-bg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: -1;
        opacity: 0;
        transition: opacity 0.4s ease;
      }

      .galaxy-portal .portal-bg {
        background: linear-gradient(90deg, rgba(100, 50, 255, 0.1), transparent);
      }

      .fog-portal .portal-bg {
        background: linear-gradient(90deg, rgba(200, 200, 220, 0.1), transparent);
      }

      .slash-portal .portal-bg {
        background: linear-gradient(90deg, rgba(255, 100, 100, 0.1), transparent);
      }

      .workshop-portal .portal-bg {
        background: linear-gradient(90deg, rgba(0, 255, 255, 0.1), transparent);
      }

      .stellar-portal .portal-bg {
        background: linear-gradient(90deg, rgba(100, 200, 255, 0.1), transparent);
      }

      .portal-card:hover {
        transform: translateX(5px);
        border-color: rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.05);
      }

      .portal-card:hover .portal-bg {
        opacity: 1;
      }

      .portal-content {
        z-index: 2;
        flex: 1;
      }

      .portal-title {
        font-size: 1.4rem;
        font-weight: 600;
        color: #fff;
        margin: 0 0 0.25rem 0;
        letter-spacing: 0.02rem;
      }

      .portal-desc {
        font-size: 0.95rem;
        color: #8888aa;
        margin: 0;
        font-weight: 300;
      }

      .portal-footer {
        z-index: 2;
        margin-left: 2rem;
        display: flex;
        align-items: center;
      }

      .key-hint {
        font-size: 0.8rem;
        color: #666688;
        text-transform: uppercase;
        letter-spacing: 0.05rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      kbd {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        padding: 2px 8px;
        color: #fff;
        font-family: 'Nunito', sans-serif;
        font-weight: 700;
        font-size: 0.9rem;
        min-width: 24px;
        text-align: center;
      }

      @keyframes fadeDown {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes fadeUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @media (max-width: 600px) {
        .landing-container {
          padding: 3.5rem 0.75rem 1.5rem;
          gap: 1rem;
          overflow-y: auto;
          max-height: 100%;
        }
        .app-title { font-size: 2.2rem; }
        .app-subtitle { font-size: 0.85rem; }
        .portals-container { 
          gap: 0.75rem; 
          padding: 0 0.25rem;
        }
        .portal-card { 
          flex-direction: column; 
          align-items: flex-start; 
          gap: 0.5rem;
          padding: 1rem;
          min-height: auto;
        }
        .portal-title { font-size: 1.1rem; }
        .portal-desc { font-size: 0.8rem; }
        .portal-footer { display: none; }
        .landing-footer { bottom: 12px; }
      }

      @media (max-width: 400px) {
        .landing-container {
          padding: 3.5rem 0.5rem 1rem;
        }
        .app-title { font-size: 1.8rem; }
        .app-subtitle { 
          font-size: 0.75rem; 
          letter-spacing: 0.05rem;
        }
        .portals-container { gap: 0.6rem; }
        .portal-card { 
          padding: 0.85rem;
          border-radius: 12px;
        }
        .portal-title { font-size: 1rem; }
        .portal-desc { font-size: 0.75rem; }
        .landing-footer { 
          bottom: 8px;
          font-size: 0.75rem;
        }
        .landing-footer a {
          padding: 4px 8px;
          font-size: 0.7rem;
        }
      }
    `;
    this.element.appendChild(style);

    this.container.appendChild(this.element);

    // Trigger reflow for transition
    requestAnimationFrame(() => {
      if (this.element) {
        this.element.classList.add('visible');
      }
    });

    this.attachListeners();
    this.isVisible = true;
  }

  /**
   * Hide and remove the landing page
   */
  hide(): void {
    if (!this.isVisible || !this.element) return;

    this.element.classList.remove('visible');

    setTimeout(() => {
      if (this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      this.element = null;
      this.isVisible = false;
    }, 600);
  }

  private attachListeners(): void {
    if (!this.element) return;

    const cards = this.element.querySelectorAll('.portal-card');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const mode = card.getAttribute('data-mode') as InteractionMode;
        if (mode) {
          this.onSelect(mode);
        }
      });
    });
  }
}
