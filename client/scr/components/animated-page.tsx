import { ReactNode } from "react";
import { motion } from "framer-motion";

interface AnimatedPageProps {
  children: ReactNode;
}

export default function AnimatedPage({ children }: AnimatedPageProps) {
  return (
    <motion.div
      initial={{ opacity: 0.4 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0.4 }}
      transition={{ 
        duration: 0.25,
        ease: [0.4, 0, 0.2, 1]
      }}
    >
      {children}
    </motion.div>
  );
}
