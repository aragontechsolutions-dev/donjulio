import { useEffect, useState } from "react";

/**
 * Scroll-spy con IntersectionObserver: devuelve el id de la sección activa
 * según la posición de scroll. Es el enfoque recomendado (sin listeners de
 * scroll manuales) y respeta el navbar fijo vía rootMargin.
 */
export function useScrollSpy(sectionIds: string[], offset = 80): string {
  const [active, setActive] = useState(sectionIds[0] ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      {
        // Compensa el navbar fijo en la parte superior.
        rootMargin: `-${offset}px 0px -55% 0px`,
        threshold: [0.1, 0.3, 0.6],
      },
    );

    const els = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sectionIds.join(","), offset]);

  return active;
}

/** Smooth scroll a una sección compensando el navbar fijo. */
export function scrollToSection(id: string, offset = 72) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: "smooth" });
}
