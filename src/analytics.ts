declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
  }
}

export const initGA = () => {
  // Already initialized in index.html script tag
  console.log("Google Analytics (gtag.js) initialized via index.html");
};

export const trackPageView = (path: string) => {
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'page_view', {
      page_path: path,
    });
  }
};

export const trackEvent = (category: string, action: string, label?: string) => {
  if (typeof window.gtag === 'function') {
    window.gtag('event', action, {
      event_category: category,
      event_label: label,
    });
  }
};

// Specific event trackers for clarity
export const trackButtonClick = (buttonName: string) => {
  trackEvent("User Interaction", `${buttonName}_clicks`, "Button Click");
};

export const trackGameStart = (mode: string) => {
  trackEvent("Game", `Game_Start_${mode}`, "Game Started");
};

export const trackGameEnd = (score: number, mode: string) => {
  trackEvent("Game", `Game_End_${mode}`, `Score: ${score}`);
};
