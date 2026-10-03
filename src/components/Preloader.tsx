import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const defaultWords = [
  "नमस्ते",
  "Hello",
  "Bonjour",
  "Ciao",
  "Olà",
  "やあ",
  "Hallå",
  "Guten Tag",
  "Hallo",
  "PlacePMS"
];

const textVariants = {
  initial: { opacity: 0 },
  enter: { 
    opacity: 0.95, 
    transition: { duration: 0.5, delay: 0.1 } 
  }
};

interface PreloaderProps {
  words?: string[];
  onComplete?: () => void;
  brandColor?: string;
  bgColor?: string;
}

export default function Preloader({
  words = defaultWords,
  onComplete,
  brandColor = "#FFFFFF",
  bgColor = "#2D7F62"
}: PreloaderProps) {
  const [index, setIndex] = useState(0);
  const [dimension, setDimension] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const handleResize = () => {
      setDimension({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    document.body.style.overflow = "hidden";
    
    return () => {
      window.removeEventListener("resize", handleResize);
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (index === words.length - 1) {
      const timer = setTimeout(() => {
        onComplete?.();
      }, 700);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setIndex(prev => prev + 1);
    }, index === 0 ? 800 : 160);

    return () => clearTimeout(timer);
  }, [index, words.length, onComplete]);

  const initialCurve = `M0 0 L${dimension.width} 0 L${dimension.width} ${dimension.height} Q${dimension.width / 2} ${dimension.height + 300} 0 ${dimension.height} L0 0`;
  const targetCurve = `M0 0 L${dimension.width} 0 L${dimension.width} ${dimension.height} Q${dimension.width / 2} ${dimension.height} 0 ${dimension.height} L0 0`;

  return (
    <motion.div
      variants={{
        initial: { top: 0 },
        exit: {
          top: "-100vh",
          transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1], delay: 0.2 }
        }
      }}
      initial="initial"
      exit="exit"
      style={{ backgroundColor: bgColor, zIndex: 99999 }}
      className="fixed inset-0 w-screen h-screen flex items-center justify-center z-[99999] pointer-events-auto select-none"
    >
      {dimension.width > 0 && (
        <>
          <motion.div
            variants={textVariants}
            initial="initial"
            animate="enter"
            className="flex items-center text-white font-medium text-3xl sm:text-4xl md:text-5xl absolute z-10 tracking-tight"
          >
            <span
              className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full mr-3 sm:mr-4 inline-block animate-pulse"
              style={{ backgroundColor: brandColor }}
            />
            <span>{words[index]}</span>
          </motion.div>
          <svg
            className="absolute top-0 w-full h-[calc(100%+300px)] pointer-events-none"
            style={{ fill: bgColor }}
          >
            <motion.path
              variants={{
                initial: {
                  d: initialCurve,
                  transition: { duration: 0.7, ease: [0.76, 0, 0.24, 1] }
                },
                exit: {
                  d: targetCurve,
                  transition: { duration: 0.7, ease: [0.76, 0, 0.24, 1], delay: 0.3 }
                }
              }}
              initial="initial"
              exit="exit"
            />
          </svg>
        </>
      )}
    </motion.div>
  );
}

export { AnimatePresence };
