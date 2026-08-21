"use client";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function RevealSection({ className, id, children }: { className?: string; id?: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  return <motion.section id={id} className={className} initial={reduced ? false : { opacity: 0, y: 12 }} whileInView={reduced ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.16 }} transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.section>;
}
