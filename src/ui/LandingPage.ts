/**
 * LandingPage Component
 * Displays the initial mode selection screen
 */

export type InteractionMode =
  | 'galaxy'
  | 'foggy-mirror'
  | 'cosmic-slash'
  | 'iron-man-workshop'
  | 'stellar-wave'
  | 'light-bulb'
  | 'magnetic-clutter';

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

          <button class="portal-card bulb-portal" data-mode="light-bulb">
            <div class="portal-content">
              <h2 class="portal-title">Light Bulb</h2>
              <p class="portal-desc">Pinch to rotate, pull cord to toggle</p>
            </div>
            <div class="portal-footer">
              <span class="key-hint">Press <kbd>L</kbd></span>
            </div>
            <div class="portal-bg"></div>
          </button>

          <button class="portal-card clutter-portal" data-mode="magnetic-clutter">
            <div class="portal-content">
              <h2 class="portal-title">Magnetic Clutter</h2>
              <p class="portal-desc">Repulse and grab magnetic spheres</p>
            </div>
            <div class="portal-footer">
              <span class="key-hint">Press <kbd>K</kbd></span>
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
        max-width: 1000px; /* Wider container for grid */
        height: 100%;
        padding: 4rem 2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center; /* Center vertically */
      }

      .landing-header {
        animation: fadeDown 0.8s ease-out forwards;
        margin-bottom: 3rem; /* Add spacing below header */
      }

      .app-title {
        font-family: 'Playfair Display', serif !important;
        font-size: 4.5rem; /* Slightly larger */
        font-weight: 700;
        letter-spacing: 0.1rem;
        margin: 0;
        background: linear-gradient(to bottom, #ffffff, #aaaaaa);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-shadow: 0 10px 30px rgba(0,0,0,0.5);
      }

      .app-subtitle {
        font-size: 1.2rem;
        color: #666688;
        margin-top: 0.5rem;
        font-weight: 300;
        letter-spacing: 0.15rem;
        text-transform: uppercase;
      }

      .portals-container {
        display: grid;
        grid-template-columns: repeat(2, 1fr); /* 2 Column Grid */
        gap: 1.5rem;
        width: 100%;
        perspective: 1000px;
        /* Remove margin auto since we justify-center parent */
      }

      .portal-card {
        position: relative;
        width: 100%;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 1.75rem;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        display: flex;
        flex-direction: column; /* Stacking content vertically */
        align-items: flex-start;
        justify-content: flex-start;
        text-align: left;
        overflow: hidden;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        animation: fadeUp 0.8s ease-out forwards;
        animation-delay: 0.2s;
        opacity: 0;
        min-height: 160px; /* Uniform height */
      }

      /* Stagger animations for grid */
      .portal-card:nth-child(1) { animation-delay: 0.1s; }
      .portal-card:nth-child(2) { animation-delay: 0.2s; }
      .portal-card:nth-child(3) { animation-delay: 0.3s; }
      .portal-card:nth-child(4) { animation-delay: 0.4s; }
      .portal-card:nth-child(5) { animation-delay: 0.5s; }
      .portal-card:nth-child(6) { animation-delay: 0.6s; }

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

      /* Gradient definitions */
      .galaxy-portal .portal-bg { background: linear-gradient(135deg, rgba(100, 50, 255, 0.15), transparent); }
      .fog-portal .portal-bg { background: linear-gradient(135deg, rgba(200, 200, 220, 0.15), transparent); }
      .slash-portal .portal-bg { background: linear-gradient(135deg, rgba(255, 100, 100, 0.15), transparent); }
      .workshop-portal .portal-bg { background: linear-gradient(135deg, rgba(0, 255, 255, 0.15), transparent); }
      .stellar-portal .portal-bg { background: linear-gradient(135deg, rgba(100, 200, 255, 0.15), transparent); }
      .bulb-portal .portal-bg { background: linear-gradient(135deg, rgba(255, 244, 224, 0.15), transparent); }
      .clutter-portal .portal-bg { background: linear-gradient(135deg, rgba(255, 50, 50, 0.15), transparent); }

      .portal-card:hover {
        transform: translateY(-5px); /* Lift up effect */
        border-color: rgba(255, 255, 255, 0.25);
        background: rgba(255, 255, 255, 0.08);
        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      }

      .portal-card:hover .portal-bg {
        opacity: 1;
      }

      .portal-content {
        z-index: 2;
        width: 100%;
        margin-bottom: 1rem;
      }

      .portal-title {
        font-size: 1.5rem;
        font-weight: 600;
        color: #fff;
        margin: 0 0 0.5rem 0;
        letter-spacing: 0.02rem;
      }

      .portal-desc {
        font-size: 0.95rem;
        color: #8888aa;
        margin: 0;
        font-weight: 300;
        line-height: 1.4;
      }

      .portal-footer {
        z-index: 2;
        margin-top: auto; /* Push to bottom */
        width: 100%;
        display: flex;
        justify-content: flex-end; /* Align to right */
      }

      .key-hint {
        font-size: 0.75rem;
        color: #666688;
        text-transform: uppercase;
        letter-spacing: 0.05rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: rgba(0,0,0,0.2);
        padding: 4px 8px;
        border-radius: 6px;
      }

      kbd {
        background: rgba(255, 255, 255, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        padding: 2px 8px;
        color: #fff;
        font-family: 'Nunito', sans-serif;
        font-weight: 700;
        font-size: 0.85rem;
        min-width: 24px;
        text-align: center;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      }

      @keyframes fadeDown {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes fadeUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Responsive Breakpoints */
      @media (max-width: 768px) {
        .landing-container {
          padding: 2rem 1.5rem;
          justify-content: flex-start;
          overflow-y: auto;
        }
        
        .portals-container {
          grid-template-columns: 1fr; /* Switch to 1 column */
          gap: 1rem;
          margin-top: 1rem;
        }

        .app-title { font-size: 3rem; }
        .app-subtitle { font-size: 1rem; }
        
        .portal-card {
          min-height: auto;
          flex-direction: row; /* Horizontal on mobile for compactness? Or Stack? Let's stack generally or Horizontal if space allows. Horizontal is often better for lists on mobile. Let's try horizontal for mobile to save vertical space? existing was horizontal. */
          /* Let's actually keep it vertical but smaller padding */
          flex-direction: row; /* Revert to horizontal row for mobile list */
          align-items: center;
          padding: 1.25rem;
        }

        .portal-content {
          margin-bottom: 0;
        }
        
        .portal-footer {
          margin-top: 0;
          width: auto;
          margin-left: 1rem;
        }
        
        /* Hide description on very small screens if needed? No, nice to have. */
      }

      @media (max-width: 480px) {
        .app-title { font-size: 2.2rem; }
        
        .portal-card {
          flex-direction: column; /* Stack on very small screens */
          align-items: flex-start;
          padding: 1rem;
        }
        
        .portal-footer {
          margin-top: 1rem;
          width: 100%;
          justify-content: flex-start; /* Left align on small mobile */
          margin-left: 0;
        }
        
        .landing-container {
          padding: 2rem 1rem;
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
