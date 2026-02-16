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
  | 'magnetic-clutter'
  | 'voxel-builder';

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
      <div class="landing-bg">
        <div class="ambient-glow glow-1"></div>
        <div class="ambient-glow glow-2"></div>
      </div>
      
      <div class="landing-container">
        <header class="landing-header">
          <h1 class="app-title">Gesture Lab</h1>
          <div class="subtitle-container">
            <span class="line"></span>
            <p class="app-subtitle">Touchless Interactive Experiences</p>
            <span class="line"></span>
          </div>
        </header>
        
        <div class="portals-grid">
          <button class="portal-card workshop-card" data-mode="iron-man-workshop">
            <div class="card-glass"></div>
            <div class="card-content">
              <div class="card-icon">🦾</div>
              <div class="card-info">
                <h3>Iron Man Workshop</h3>
                <p>MK-VI Armor Interface</p>
              </div>
              <div class="key-indicator">i</div>
            </div>
          </button>

          <button class="portal-card slash-card" data-mode="cosmic-slash">
            <div class="card-glass"></div>
            <div class="card-content">
              <div class="card-icon">⚔️</div>
              <div class="card-info">
                <h3>Cosmic Slash</h3>
                <p>Slice Spacetime Anomalies</p>
              </div>
              <div class="key-indicator">c</div>
            </div>
          </button>

          <button class="portal-card galaxy-card" data-mode="galaxy">
            <div class="card-glass"></div>
            <div class="card-content">
              <div class="card-icon">🌌</div>
              <div class="card-info">
                <h3>Interactive Galaxy</h3>
                <p>Particle Universe</p>
              </div>
              <div class="key-indicator">g</div>
            </div>
          </button>
          
          <button class="portal-card fog-card" data-mode="foggy-mirror">
            <div class="card-glass"></div>
            <div class="card-content">
              <div class="card-icon">🌫️</div>
              <div class="card-info">
                <h3>Foggy Mirror</h3>
                <p>Reveal the Unseen</p>
              </div>
              <div class="key-indicator">f</div>
            </div>
          </button>

          <button class="portal-card stellar-card" data-mode="stellar-wave">
            <div class="card-glass"></div>
            <div class="card-content">
              <div class="card-icon">🌊</div>
              <div class="card-info">
                <h3>Stellar Wave</h3>
                <p>Cosmic Ripple Effect</p>
              </div>
              <div class="key-indicator">s</div>
            </div>
          </button>

          <button class="portal-card bulb-card" data-mode="light-bulb">
            <div class="card-glass"></div>
            <div class="card-content">
              <div class="card-icon">💡</div>
              <div class="card-info">
                <h3>Light Bulb</h3>
                <p>Interactive Illumination</p>
              </div>
              <div class="key-indicator">l</div>
            </div>
          </button>

          <button class="portal-card clutter-card" data-mode="magnetic-clutter">
            <div class="card-glass"></div>
            <div class="card-content">
              <div class="card-icon">🌑</div>
              <div class="card-info">
                <h3>Magnetic Clutter</h3>
                <p>Force Field Physics</p>
              </div>
              <div class="key-indicator">k</div>
            </div>
          </button>

          <button class="portal-card voxel-card" data-mode="voxel-builder">
            <div class="card-glass"></div>
            <div class="card-content">
              <div class="card-icon">🧱</div>
              <div class="card-info">
                <h3>Voxel Builder</h3>
                <p>Build in 3D Space</p>
              </div>
              <div class="key-indicator">v</div>
            </div>
          </button>
        </div>
      </div>
    `;

    // Add Premium Styles
    const style = document.createElement('style');
    style.id = 'landing-page-style';
    style.textContent = `
      :root {
        --glass-bg: rgba(255, 255, 255, 0.03);
        --glass-border: rgba(255, 255, 255, 0.08);
        --glass-highlight: rgba(255, 255, 255, 0.15);
        --accent-glow: rgba(100, 200, 255, 0.1);
        --text-primary: rgba(255, 255, 255, 0.95);
        --text-secondary: rgba(255, 255, 255, 0.6);
      }

      .landing-page {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #030305;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
        font-family: 'Nunito', sans-serif;
        overflow: hidden;
      }

      /* Ambient Background Effects */
      .landing-bg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        z-index: 0;
        pointer-events: none;
      }

      .ambient-glow {
        position: absolute;
        border-radius: 50%;
        filter: blur(80px);
        opacity: 0.4;
      }

      .glow-1 {
        top: -10%;
        left: -10%;
        width: 50%;
        height: 50%;
        background: radial-gradient(circle, rgba(60, 20, 100, 0.3), transparent 70%);
        animation: float 15s infinite ease-in-out;
      }

      .glow-2 {
        bottom: -10%;
        right: -10%;
        width: 60%;
        height: 60%;
        background: radial-gradient(circle, rgba(20, 60, 100, 0.3), transparent 70%);
        animation: float 20s infinite ease-in-out reverse;
      }

      @keyframes float {
        0%, 100% { transform: translate(0, 0); }
        50% { transform: translate(30px, -30px); }
      }
      
      .landing-page.visible {
        opacity: 1;
      }

      .landing-container {
        position: relative;
        z-index: 10;
        width: 100%;
        max-width: 1100px;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 2rem;
      }

      /* Header Styling */
      .landing-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-bottom: 4rem;
        animation: slideDown 1s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
      }

      .app-title {
        font-family: 'Playfair Display', serif;
        font-size: 5rem;
        font-weight: 400;
        letter-spacing: -0.02em;
        margin: 0;
        background: linear-gradient(to bottom, #fff, #aaa);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-shadow: 0 0 30px rgba(255,255,255,0.1);
      }

      .subtitle-container {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        margin-top: 1rem;
        opacity: 0.7;
      }

      .line {
        width: 40px;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
      }

      .app-subtitle {
        font-size: 0.85rem;
        letter-spacing: 0.3em;
        text-transform: uppercase;
        color: #ccd;
        margin: 0;
        font-weight: 600;
      }

      /* Grid Layout */
      .portals-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 1.5rem;
        width: 100%;
        perspective: 1000px;
      }

      /* Card Styling */
      .portal-card {
        position: relative;
        height: 140px;
        background: transparent;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        overflow: hidden;
        padding: 0;
        text-align: left;
        transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
        animation: fadeUp 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        opacity: 0;
      }

      .portal-card:hover {
        transform: translateY(-4px) scale(1.02);
      }

      .card-glass {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        border-radius: 12px;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        transition: all 0.4s ease;
        z-index: 1;
      }

      .portal-card:hover .card-glass {
        background: rgba(255, 255, 255, 0.06);
        border-color: var(--glass-highlight);
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      }

      .card-content {
        position: relative;
        z-index: 2;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        padding: 1.5rem;
        gap: 1.25rem;
      }

      .card-icon {
        font-size: 2rem;
        opacity: 0.8;
        filter: grayscale(100%);
        transition: all 0.4s ease;
      }

      .portal-card:hover .card-icon {
        filter: grayscale(0%);
        transform: scale(1.1);
        opacity: 1;
      }

      .card-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .card-info h3 {
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0;
        letter-spacing: 0.01em;
      }

      .card-info p {
        font-size: 0.8rem;
        color: var(--text-secondary);
        margin: 0;
        font-weight: 400;
      }

      .key-indicator {
        font-family: 'Nunito', monospace;
        font-size: 0.7rem;
        color: rgba(255,255,255,0.4);
        border: 1px solid rgba(255,255,255,0.1);
        padding: 2px 8px;
        border-radius: 4px;
        text-transform: uppercase;
        transition: all 0.3s ease;
      }

      .portal-card:hover .key-indicator {
        border-color: rgba(255,255,255,0.3);
        color: #fff;
        background: rgba(255,255,255,0.1);
      }

      /* Specific Card Accents on Hover */
      .workshop-card:hover .card-glass { box-shadow: 0 0 30px rgba(0, 255, 255, 0.15); }
      .slash-card:hover .card-glass { box-shadow: 0 0 30px rgba(255, 100, 100, 0.15); }
      .galaxy-card:hover .card-glass { box-shadow: 0 0 30px rgba(100, 50, 255, 0.15); }
      .fog-card:hover .card-glass { box-shadow: 0 0 30px rgba(200, 200, 220, 0.15); }
      .stellar-card:hover .card-glass { box-shadow: 0 0 30px rgba(100, 200, 255, 0.15); }
      .bulb-card:hover .card-glass { box-shadow: 0 0 30px rgba(255, 244, 224, 0.15); }
      .clutter-card:hover .card-glass { box-shadow: 0 0 30px rgba(255, 50, 50, 0.15); }
      .voxel-card:hover .card-glass { box-shadow: 0 0 30px rgba(0, 200, 120, 0.15); }

      /* Animation Delays */
      .portal-card:nth-child(1) { animation-delay: 0.1s; }
      .portal-card:nth-child(2) { animation-delay: 0.15s; }
      .portal-card:nth-child(3) { animation-delay: 0.2s; }
      .portal-card:nth-child(4) { animation-delay: 0.25s; }
      .portal-card:nth-child(5) { animation-delay: 0.3s; }
      .portal-card:nth-child(6) { animation-delay: 0.35s; }
      .portal-card:nth-child(7) { animation-delay: 0.4s; }
      .portal-card:nth-child(8) { animation-delay: 0.45s; }

      @keyframes fadeUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes slideDown {
        from { opacity: 0; transform: translateY(-30px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Responsive */
      @media (max-width: 768px) {
        .landing-container { padding: 1.5rem; justify-content: flex-start; overflow-y: auto; }
        .app-title { font-size: 3rem; margin-bottom: 0.5rem; }
        .logo-mark { margin-bottom: 1rem; }
        .landing-header { margin-bottom: 2rem; margin-top: 2rem; }
        .portals-grid { grid-template-columns: 1fr; gap: 1rem; padding-bottom: 2rem; }
        .portal-card { height: 100px; }
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
