import confetti from "canvas-confetti";

/** Full-screen gold & cream celebration burst */
export function fireConfetti() {
  const gold = "#C9A84C";
  const cream = "#F5F0E8";
  const charcoal = "#1C1D20";

  // Left cannon
  confetti({
    particleCount: 80,
    angle: 60,
    spread: 55,
    origin: { x: 0, y: 0.75 },
    colors: [gold, cream, charcoal, "#fff"],
    scalar: 1.1,
  });

  // Right cannon
  confetti({
    particleCount: 80,
    angle: 120,
    spread: 55,
    origin: { x: 1, y: 0.75 },
    colors: [gold, cream, charcoal, "#fff"],
    scalar: 1.1,
  });

  // Center burst after short delay
  setTimeout(() => {
    confetti({
      particleCount: 60,
      spread: 100,
      origin: { x: 0.5, y: 0.6 },
      colors: [gold, cream, "#fff"],
      scalar: 0.9,
    });
  }, 250);
}

/** Smaller single-point burst (for individual badge earned) */
export function fireMiniConfetti(x = 0.5, y = 0.5) {
  confetti({
    particleCount: 40,
    spread: 70,
    origin: { x, y },
    colors: ["#C9A84C", "#F5F0E8", "#fff"],
    scalar: 0.8,
  });
}
