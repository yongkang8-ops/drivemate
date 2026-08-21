"use client";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function RevealSection({ className, id, children }: { className?: string; id?: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      id={id}
      className={className}
      initial={{ opacity: 1, y: 0 }}
      whileInView={reduced ? undefined : { y: [12, 0] }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.section>
  );
}
