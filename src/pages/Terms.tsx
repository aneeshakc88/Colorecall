import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Terms() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 p-8 md:p-16 font-sans selection:bg-black selection:text-white">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-black transition-colors mb-8 font-medium">
          <ArrowLeft size={16} />
          Back to Game
        </Link>
        
        <h1 className="text-4xl font-bold tracking-tighter mb-8">Terms of Service</h1>
        
        <div className="space-y-6 text-zinc-600 leading-relaxed">
          <p>Last updated: April 2026</p>
          
          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-black tracking-tight">1. Acceptance of Terms</h2>
            <p>By accessing and playing Colorecall ("the Game"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not play the Game.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-black tracking-tight">2. The Game</h2>
            <p>Colorecall is a daily color memory and matching game. We provide daily challenges, solo modes, and multiplayer modes. The game mechanics involve viewing a target color and attempting to recreate it from memory using HSB (Hue, Saturation, Brightness) controls.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-black tracking-tight">3. User Accounts and Data</h2>
            <p>We may store your game progress, daily streaks, and high scores. You are responsible for maintaining the confidentiality of your account information (if applicable). We reserve the right to reset leaderboards or game statistics if we detect cheating or exploitation of game mechanics.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-black tracking-tight">4. Fair Play</h2>
            <p>Players are expected to play fairly. Using automated scripts, color-picking tools, or any external assistance to achieve perfect scores in the daily challenge undermines the spirit of the game and is strictly prohibited.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-black tracking-tight">5. Intellectual Property</h2>
            <p>All content, features, and functionality of Colorecall, including but not limited to the design, text, graphics, and game mechanics, are owned by Colorecall and are protected by international copyright, trademark, and other intellectual property laws.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
