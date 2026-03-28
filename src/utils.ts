export const getDynamicFeedback = (score: number, prevScore: number | null, shapeCorrect: boolean): string => {
  if (!shapeCorrect) {
    const wrongShapeMessages = [
      "Wrong shape, poor vision.", 
      "Focus on the shape.", 
      "Shape mismatch.", 
      "Not the right form.", 
      "Eyes on the object.",
      "Shape blindness?",
      "That's not it.",
      "Form is everything."
    ];
    return wrongShapeMessages[Math.floor(Math.random() * wrongShapeMessages.length)];
  }

  let trendMessage = "";
  if (prevScore !== null) {
    if (score > prevScore + 5) {
      const improving = [
        "You're getting sharper.", 
        "Improving!", 
        "On the right track.", 
        "Sharp eyes.", 
        "Getting better!",
        "Dialing it in.",
        "Vision is clearing.",
        "Calibration successful."
      ];
      trendMessage = improving[Math.floor(Math.random() * improving.length)] + " ";
    } else if (score < prevScore - 5) {
      const declining = [
        "Losing focus.", 
        "Keep your eyes peeled.", 
        "Don't slip now.", 
        "A bit off.", 
        "Focus!",
        "Vision is blurring.",
        "Losing the signal.",
        "Fading out."
      ];
      trendMessage = declining[Math.floor(Math.random() * declining.length)] + " ";
    }
  }

  let scoreMessage = "";
  if (score >= 24.5) {
    scoreMessage = [
      "Absolute precision.", 
      "Perfect perception.", 
      "Your brain took a photograph.",
      "Sublime accuracy.",
      "God-like vision.",
      "Pixel perfect."
    ][Math.floor(Math.random() * 6)];
  } else if (score >= 23.5) {
    scoreMessage = [
      "Remarkable accuracy.", 
      "Excellent eye.", 
      "Elite vision.",
      "Stunningly close.",
      "Masterful.",
      "Sharp as a razor."
    ][Math.floor(Math.random() * 6)];
  } else if (score >= 22) {
    scoreMessage = [
      "Impressive.", 
      "Very close.", 
      "Great job.",
      "Strong effort.",
      "Solid perception.",
      "Well observed."
    ][Math.floor(Math.random() * 6)];
  } else if (score >= 20) {
    scoreMessage = [
      "Decent.", 
      "Getting there.", 
      "A fair approximation.",
      "Passable.",
      "Within range.",
      "Acceptable."
    ][Math.floor(Math.random() * 6)];
  } else if (score >= 17) {
    scoreMessage = [
      "A bit off.", 
      "Needs more focus.", 
      "Slightly distorted.",
      "Distorted.",
      "Blurry vision.",
      "Missed the mark."
    ][Math.floor(Math.random() * 6)];
  } else if (score >= 12) {
    scoreMessage = [
      "Way off.", 
      "Lacking precision.", 
      "Color dissonance.",
      "Total dissonance.",
      "Fading fast.",
      "Unrecognizable."
    ][Math.floor(Math.random() * 6)];
  } else {
    scoreMessage = [
      "Blind guess?", 
      "Try again.", 
      "Keep practicing.",
      "Are you even looking?",
      "Complete blackout.",
      "Pure static."
    ][Math.floor(Math.random() * 6)];
  }

  return trendMessage + scoreMessage;
};
