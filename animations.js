import {
  animate,
  stagger,
} from "https://cdn.jsdelivr.net/npm/motion@13.1.0/+esm";

const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

if (!reducedMotion) {
  animate(
    ".hero-label, .hero-title, .hero-subtitle, .hero-desc",
    {
      opacity: [0, 1],
      transform: ["translateY(14px)", "translateY(0)"],
    },
    {
      duration: 0.55,
      delay: stagger(0.08),
      ease: "easeOut",
    },
  );

  animate(
    ".calculator-left, .calculator-right",
    {
      opacity: [0, 1],
      transform: ["translateY(18px)", "translateY(0)"],
    },
    {
      duration: 0.55,
      delay: stagger(0.12, { startDelay: 0.2 }),
      ease: "easeOut",
    },
  );

  const calculator = document.getElementById("calculator");
  const outputPrice = document.getElementById("totalPrice");

  calculator.addEventListener("input", () => {
    animate(
      outputPrice,
      {
        transform: ["scale(1)", "scale(1.035)", "scale(1)"],
      },
      {
        duration: 0.28,
        ease: "easeOut",
      },
    );
  });

  document
    .querySelectorAll(".primary-button, .secondary-button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        animate(
          button,
          {
            transform: ["scale(1)", "scale(0.97)", "scale(1)"],
          },
          {
            duration: 0.2,
          },
        );
      });
    });
}
