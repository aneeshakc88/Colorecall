import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 p-8 md:p-16 font-sans selection:bg-black selection:text-white">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-black transition-colors mb-8 font-medium">
          <ArrowLeft size={16} />
          Back to Game
        </Link>
        
        <h1 className="text-4xl font-bold tracking-tighter mb-8">Privacy Policy</h1>
        
        <div className="space-y-6 text-zinc-600 leading-relaxed">
          <p>Last updated: April 2026</p>
          
          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-black tracking-tight">1. Information We Collect</h2>
            <p>When you play Colorecall, we collect minimal information necessary to provide and improve the game experience. This includes:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Game Data:</strong> Your scores, daily streaks, color guesses, and game mode preferences.</li>
              <li><strong>Usage Data:</strong> Anonymous analytics regarding how you interact with the game (e.g., time spent, buttons clicked) to help us improve the user interface and game balance.</li>
              <li><strong>Device Information:</strong> Basic information such as your browser type and screen resolution to ensure the game renders correctly on your device.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-black tracking-tight">2. How We Use Your Information</h2>
            <p>We use the collected data solely to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Save your game progress and maintain the daily challenge leaderboards.</li>
              <li>Analyze game difficulty (e.g., average score for a specific daily color) to tune future challenges.</li>
              <li>Improve the overall performance and design of Colorecall.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-black tracking-tight">3. Cookies and Local Storage</h2>
            <p>Colorecall uses local storage in your browser to save your current game state, sound preferences, and daily challenge completion status. We do not use tracking cookies for targeted advertising.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-black tracking-tight">4. Third-Party Services</h2>
            <p>We may use third-party analytics services (such as Google Analytics) to understand game traffic. These services have their own privacy policies addressing how they use such information.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-black tracking-tight">5. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy or your game data, please reach out to us through our official social media channels.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
